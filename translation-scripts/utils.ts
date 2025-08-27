import fs from "fs/promises";
import { glob } from "glob";
import yaml from "js-yaml";
import crypto from "node:crypto";

const API_KEY = process.env.WEGLOT_API_KEY || false;
const WEGLOT_URL = API_KEY
  ? `https://api.weglot.com/translate?api_key=${API_KEY}`
  : false;
const BASE_URL = process.env.BASE_URL || "https://www.ineedaplanc.org";

const textTypes = {
  text: 1,
  title: 9,
  value: 2,
};

export type TranslatedObject<T extends object, K extends keyof T> = T & {
  es?: Record<K, string>;
};

type TranslationKey = { key: string } & (
  | { type?: keyof typeof textTypes }
  | { keys: TranslationKey[]; container: "array" | "record" | "object" }
);
type WordForTranslation = { w: string; t: number; hash: string } | string;
type WordFromTranslation = { w: string; hash: string } | string;

function extractObjectValuesForTranslation<T extends object>(
  items: T[],
  keys: TranslationKey[]
): WordForTranslation[] {
  return items.flatMap((value) => {
    const es: object =
      "es" in value && value.es && typeof value.es === "object" ? value.es : {};
    return keys.flatMap((key) => {
      if ("container" in key && typeof value[key.key] === "object") {
        if (key.container === "object") {
          const v = extractObjectValuesForTranslation(
            [value[key.key]],
            key.keys
          );
          console.log("Extracted for object", v);
          return v;
        } else if (key.container === "array" && Array.isArray(value[key.key])) {
          const v = extractObjectValuesForTranslation(value[key.key], key.keys);
          console.log("Extracted for array", v);
          return v;
        }
        return extractObjectValuesForTranslation(
          Object.keys(value[key.key]).map((v) => value[key.key][v]),
          key.keys
        );
      } else if (
        "type" in key &&
        key.key in value &&
        typeof value[key.key] === "string"
      ) {
        const hash = crypto
          .createHash("sha256")
          .update(value[key.key])
          .digest("base64");
        if (es["__" + key.key] === hash) {
          return [hash];
        }
        return [
          {
            w: value[key.key],
            t: textTypes[key.type || "text"],
            hash,
          },
        ];
      } else {
        return [];
      }
    });
  });
}

function matchWordArrays(toTranslate: WordForTranslation[], words: string[]) {
  let i = 0;
  return toTranslate.map((v) => {
    if (typeof v === "string") {
      return v;
    } else {
      const w = words[i];
      i++;
      return {
        w,
        hash: v.hash,
      };
    }
  });
}

function setTranslatedValues<T extends object>(
  items: T[],
  keys: TranslationKey[],
  translations: WordFromTranslation[],
  startAt: number
): { next: number; result: object[] } {
  let next = startAt;
  const result = items.map((value) => {
    const oldEs: Record<string, string> =
      "es" in value && value.es && typeof value.es === "object"
        ? (value.es as Record<string, string>)
        : {};
    const es: Record<string, string> = {};
    const nv: object = {
      ...value,
    };
    for (const key of keys) {
      if ("container" in key && typeof value[key.key] === "object") {
        if (key.container === "object") {
          const v = setTranslatedValues(
            [value[key.key]],
            key.keys,
            translations,
            next
          );
          next = v.next;
          nv[key.key] = v.result[0];
        } else if (key.container === "array" && Array.isArray(value[key.key])) {
          const v = setTranslatedValues(
            value[key.key],
            key.keys,
            translations,
            next
          );
          next = v.next;
          nv[key.key] = result;
        }
        const children = Object.keys(value[key.key]);
        const v = setTranslatedValues(
          children.map((v) => value[key.key][v]),
          key.keys,
          translations,
          next
        );
        next = v.next;
        const r = {};
        for (const e of v.result.entries()) {
          r[children[e[0]]] = e[1];
        }
        nv[key.key] = r;
      } else if (
        "type" in key &&
        key.key in value &&
        typeof value[key.key] === "string"
      ) {
        const translation = translations[next];
        next++;
        if (typeof translation === "string") {
          es[key.key] = oldEs[key.key];
          es["__" + key.key] = translation;
        } else {
          es[key.key] = translation.w;
          es["__" + key.key] = translation.hash;
        }
      }
    }
    return { ...nv, es };
  });
  return { result, next };
}

export async function translateAllYaml(
  folder: string,
  keys: TranslationKey[],
  { url }: { url?: string }
) {
  if (!WEGLOT_URL) throw new Error("No weglot url");
  const filePaths: string[] = await glob(folder + "/*.yaml");
  const files = await Promise.all(
    filePaths.map(async (path) => {
      const content = await fs.readFile(path, { encoding: "utf-8" });
      const parsed = yaml.load(content);
      return {
        path,
        content: parsed,
      };
    })
  );
  const fullKeys = [{ key: "content", keys, container: "object" }];
  const wordsToTranslate = extractObjectValuesForTranslation(files, fullKeys);

  console.log("Translating - ", url);
  const u = `${BASE_URL}/${url || ""}`;
  const body = {
    l_from: "en",
    l_to: "es",
    request_url: u,
    words: wordsToTranslate
      .filter((v) => typeof v === "object")
      .map((v) => ({ w: v.w, t: v.t })),
  };
  if (body.words.length === 0) {
    console.log(`No new translations in ${url}`);
    return;
  }
  console.log(`Translating ${body.words.length} values`);
  const result = await fetch(WEGLOT_URL, {
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    method: "POST",
  });

  if (!result.ok) {
    throw new Error("Failed to get translation");
  }
  const parsed = (await result.json()) as { to_words: string[] };
  console.log("Translated - ", url);

  const translations = matchWordArrays(wordsToTranslate, parsed.to_words);
  const v = setTranslatedValues(files, fullKeys, translations, 0);
  await Promise.all(
    v.result.map(async (val) => {
      const { content, path } = val as { content: object; path: string };
      const text = yaml.dump(content);
      await fs.writeFile(path, text, { encoding: "utf-8" });
    })
  );
}
