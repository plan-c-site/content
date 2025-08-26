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

export async function translateObjectArray<T extends object, K extends keyof T>(
  items: T[],
  keys: { key: K; mdx?: boolean }[],
  { url, type }: { url?: string; type?: keyof typeof textTypes }
): Promise<TranslatedObject<T, K>[]> {
  if (!WEGLOT_URL) throw new Error("No weglot url");
  console.log("Translating - ", url);
  const u = `${BASE_URL}/${url || ""}`;
  const t = textTypes[type || "text"];
  const body = {
    l_from: "en",
    l_to: "es",
    request_url: u,
    words: items.flatMap((w) =>
      keys.map((k) => ({
        w: w[k.key] as string,
        t,
      }))
    ),
  };
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
  let soFar = 0;
  return items.map((w) => {
    const es: Record<K, string> = {} as unknown as Record<K, string>;

    for (const k of keys) {
      es[k.key] = parsed.to_words[soFar];
      soFar++;
    }

    const val = { ...w, es };
    return val;
  });
}

export async function translateAllYaml<KEYS extends string>(
  folder: string,
  keys: KEYS[],
  { url, type }: { url?: string; type?: keyof typeof textTypes }
) {
  const filePaths: string[] = await glob(folder + "/*.yaml");
  const files = await Promise.all(
    filePaths.map(async (path) => {
      const content = await fs.readFile(path, { encoding: "utf-8" });
      const parsed = yaml.load(content) as Record<KEYS, string> & {
        es?: Record<string, string>;
      };
      const es: Record<string, string> = {};
      const toTranslate: {
        path: string;
        key: KEYS;
        english: string;
        hash: string;
      }[] = [];
      for (const key of keys) {
        if (parsed[key]) {
          const hash = crypto
            .createHash("sha256")
            .update(parsed[key])
            .digest("base64");
          if (parsed.es && parsed.es[key] && parsed.es["__" + key] === hash) {
            es[key] = parsed.es[key];
            es["__" + key] = parsed.es["__" + key];
          } else {
            toTranslate.push({ path, key, english: parsed[key], hash });
          }
        }
      }
      return {
        path,
        content: parsed,
        es,
        toTranslate,
      };
    })
  );
  if (!WEGLOT_URL) throw new Error("No weglot url");
  console.log("Translating - ", url);
  const u = `${BASE_URL}/${url || ""}`;
  const t = textTypes[type || "text"];
  const body = {
    l_from: "en",
    l_to: "es",
    request_url: u,
    words: files.flatMap((w) =>
      w.toTranslate.map((k) => ({
        w: k.english,
        t,
      }))
    ),
  };
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
  let soFar = 0;
  const results = files.map(({ content, path, es, toTranslate }) => {
    for (const k of toTranslate) {
      es[k.key] = parsed.to_words[soFar];
      es["__" + k.key] = k.hash;
      soFar++;
    }

    return { content: { ...content, es }, path };
  });
  await Promise.all(
    results.map(async ({ content, path }) => {
      const text = yaml.dump(content);
      await fs.writeFile(path, text, { encoding: "utf-8" });
    })
  );
}
