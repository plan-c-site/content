import fs from "fs/promises";
import { glob } from "glob";
import yaml from "js-yaml";
import crypto from "node:crypto";
import path from "node:path";
import markdoc, { Node } from "@markdoc/markdoc";

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

export type TranslationKey =
  | ({ key: string } & (
      | { type?: keyof typeof textTypes }
      | { keys: TranslationKey[]; container: "array" | "record" | "object" }
      | {
          keys: TranslationKey[];
          container: "array" | "record" | "object";
          condition: string;
        }
    ))
  | { has_condition: string; keys: TranslationKey[] };
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
      if ("has_condition" in key) {
        if (
          "discriminant" in value &&
          "value" in value &&
          value.discriminant === key.has_condition
        ) {
          return extractObjectValuesForTranslation(
            [value.value as object],
            key.keys
          );
        }
        return [];
      }
      if (key.key == "links") {
      }
      if ("container" in key && typeof value[key.key] === "object") {
        if ("condition" in key) {
          const val =
            ("value" in value[key.key] && (value[key.key].value as object)) ||
            false;
          const dis =
            ("discriminant" in value[key.key] &&
              (value[key.key].discriminant as string)) ||
            false;

          if (dis !== key.condition || !val) {
            return [];
          }
          if (key.container === "object") {
            const v = extractObjectValuesForTranslation([val], key.keys);
            return v;
          } else if (key.container === "array" && Array.isArray(val)) {
            const v = extractObjectValuesForTranslation(val, key.keys);
            return v;
          }
          return extractObjectValuesForTranslation(
            Object.keys(value[key.key]).map((v) => val[v]),
            key.keys
          );
        } else {
          if (key.container === "object") {
            const v = extractObjectValuesForTranslation(
              [value[key.key]],
              key.keys
            );
            return v;
          } else if (
            key.container === "array" &&
            Array.isArray(value[key.key])
          ) {
            const v = extractObjectValuesForTranslation(
              value[key.key],
              key.keys
            );
            return v;
          }
          return extractObjectValuesForTranslation(
            Object.keys(value[key.key]).map((v) => value[key.key][v]),
            key.keys
          );
        }
      } else if (key.key in value && typeof value[key.key] === "string") {
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
            t: textTypes[("type" in key && key.type) || "text"],
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
  startAt: number,
  override?: boolean
): { next: number; result: object[] } {
  let next = startAt;
  const result = items.map((value, i) => {
    const oldEs: Record<string, string> =
      typeof value === "object" &&
      "es" in value &&
      value.es &&
      typeof value.es === "object"
        ? (value.es as Record<string, string>)
        : {};
    const es: Record<string, string> = {};
    const nv: object = {
      ...value,
    };
    for (const key of keys) {
      if ("has_condition" in key) {
        if (
          "discriminant" in value &&
          "value" in value &&
          value.discriminant === key.has_condition
        ) {
          const result = setTranslatedValues(
            [value.value as object],
            key.keys,
            translations,
            next,
            override
          );
          next = result.next;
          nv["discriminant"] = value.discriminant;
          nv["value"] = result.result[0];
          return nv;
        }
        continue;
      }
      const val = value[key.key];

      if ("container" in key && typeof val === "object") {
        if ("condition" in key) {
          const va = ("value" in val && (val.value as object)) || false;
          const discriminant =
            ("discriminant" in val && (val.discriminant as string)) || false;

          if (discriminant !== key.condition || !va) {
            continue;
          }
          if (key.container === "object") {
            const v = setTranslatedValues(
              [va],
              key.keys,
              translations,
              next,
              override
            );
            next = v.next;
            nv[key.key] = { discriminant, value: v.result[0] };
          } else if (key.container === "array" && Array.isArray(va)) {
            const v = setTranslatedValues(
              va,
              key.keys,
              translations,
              next,
              override
            );
            next = v.next;
            nv[key.key] = { discriminant, value: v.result };
          } else {
            const children = Object.keys(va);
            const v = setTranslatedValues(
              children.map((v) => va[v]),
              key.keys,
              translations,
              next,
              override
            );
            next = v.next;
            const r = {};
            for (const e of v.result.entries()) {
              r[children[e[0]]] = e[1];
            }
            nv[key.key] = { discriminant, value: r };
          }
        } else {
          if (key.container === "object") {
            const v = setTranslatedValues(
              [val],
              key.keys,
              translations,
              next,
              override
            );
            next = v.next;
            nv[key.key] = v.result[0];
          } else if (key.container === "array" && Array.isArray(val)) {
            const v = setTranslatedValues(
              val,
              key.keys,
              translations,
              next,
              override
            );
            next = v.next;
            nv[key.key] = v.result;
          } else {
            const children = Object.keys(val);
            const v = setTranslatedValues(
              children.map((v) => val[v]),
              key.keys,
              translations,
              next,
              override
            );
            next = v.next;
            const r = {};
            for (const e of v.result.entries()) {
              r[children[e[0]]] = e[1];
            }
            nv[key.key] = r;
          }
        }
      } else if (key.key in value && typeof val === "string") {
        const translation = translations[next];
        next++;
        if (typeof translation === "string") {
          es[key.key] = oldEs[key.key];
          es["__" + key.key] = translation;
        } else if (translation) {
          es[key.key] = translation.w;
          es["__" + key.key] = translation.hash;
        }
      }
    }
    if (Object.keys(es).length > 0) {
      if (override) {
        const n = { ...nv };
        for (const key of Object.keys(es)) {
          if (key.startsWith("__")) {
            continue;
          }
          n[key] = es[key];
        }
        return n;
      }
      return { ...nv, es };
    }
    return nv;
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

export async function translateMarkdownValues(
  folder: string,
  keys: TranslationKey[],
  { url_base }: { url_base?: string }
) {
  if (!WEGLOT_URL) throw new Error("No weglot url");
  const filePaths: string[] = await glob(folder + "/**/*.mdoc");
  await Promise.all(
    filePaths.map(async (v) => {
      if (v.includes("/es/")) {
        return;
      }
      const url = url_base + v.replace(folder, "");
      const dir = path.join(path.dirname(v), "./es/");
      await fs.mkdir(dir, { recursive: true });
      const newPath = path.join(dir, path.basename(v));
      return translateMardown(v, newPath, keys, url);
    })
  );
}

export async function translateMarkdownRoots(
  folder: string,
  keys: TranslationKey[],
  keyName: string,
  { url_base }: { url_base?: string }
) {
  if (!WEGLOT_URL) throw new Error("No weglot url");
  const filePaths: string[] = await glob(folder + "/**/*.mdoc");
  await Promise.all(
    filePaths.map(async (v) => {
      if (
        !v.includes("/xyz_test-page.mdoc") &&
        !v.includes("/xyz_form") &&
        !v.includes("/home.mdoc")
      )
        return;
      if (v.includes("/es/")) {
        return;
      }
      const url = url_base + v.replace(folder, "");
      const dir = path.join(
        path.dirname(v),
        `./${path.basename(v).replace(path.extname(v), "")}/es/`
      );
      await fs.mkdir(dir, { recursive: true });
      const newPath = path.join(dir, keyName + ".mdoc");
      return translateMardown(v, newPath, keys, url);
    })
  );
}

const sectionTranslations: Record<string, TranslationKey[]> = {
  actionBanner: [
    { key: "title" },
    { key: "link", container: "object", keys: [{ key: "label" }] },
  ],
  cardSection: [{ key: "title" }, { key: "label" }],
  filteredListings: [{ key: "title" }],
  formInput: [
    {
      key: "fields",
      container: "array",
      keys: [
        { key: "label", container: "object", keys: [{ key: "name" }] },
        {
          key: "type",
          container: "object",
          condition: "text",
          keys: [{ key: "placeholder" }],
        },
        {
          key: "type",
          container: "object",
          condition: "select",
          keys: [
            { key: "placeholder" },
            {
              key: "options",
              container: "array",
              condition: "false",
              keys: [{ key: "label" }],
            },
          ],
        },
      ],
    },
  ],
  inContentButton: [{ key: "label" }],
  inContentDropdown: [
    { key: "label" },
    {
      key: "options",
      container: "array",
      keys: [
        {
          has_condition: "link",
          keys: [{ key: "label" }],
        },
      ],
    },
  ],
  logoBanner: [{ key: "title" }],
  sectionHeader: [{ key: "title" }],
  timelineSection: [{ key: "title" }],
  toDoSection: [{ key: "title" }],
  tocAnchor: [{ key: "slug", container: "object", keys: [{ key: "name" }] }],
};

function extractParagraphsFromMarkdown(node: Node): WordForTranslation[] {
  if (
    "content" in node.attributes &&
    typeof node.attributes.content === "string"
  ) {
    return [
      {
        w: node.attributes.content,
        t: textTypes.text,
        hash: "",
      },
    ];
  } else if (node.tag && sectionTranslations[node.tag]) {
    const attrs = extractObjectValuesForTranslation(
      [node.attributes],
      sectionTranslations[node.tag]
    );

    if (node.tag === "actionBanner") {
      console.log("EXTRACTED", attrs);
    }
    const children = node.children.flatMap((n) =>
      extractParagraphsFromMarkdown(n)
    );
    return [...attrs, ...children];
  } else {
    return node.children.flatMap((n) => extractParagraphsFromMarkdown(n));
  }
}

function applyTranslationsToMarkdown(
  node: Node,
  translations: WordFromTranslation[],
  startAt: number
) {
  if (
    "content" in node.attributes &&
    typeof node.attributes.content === "string"
  ) {
    const translation = translations[startAt];

    const val =
      translation && typeof translation === "object"
        ? translation.w
        : translation;

    const attributes = {
      ...node.attributes,
      content: val || "",
    };
    const n = new Node(node.type, attributes, node.children, node.tag);
    return {
      n,
      next: startAt + 1,
    };
  } else {
    let attributes = node.attributes;
    let i = startAt;
    if (node.tag && sectionTranslations[node.tag]) {
      const attrs = setTranslatedValues(
        [attributes],
        sectionTranslations[node.tag],
        translations,
        startAt,
        true
      );
      attributes = attrs.result[0];
      i = attrs.next;
    }
    const children: Node[] = [];
    for (const child of node.children) {
      const { n, next } = applyTranslationsToMarkdown(child, translations, i);
      i = next;
      children.push(n);
    }

    return {
      n: new Node(node.type, attributes, children, node.tag),
      next: i,
    };
  }
}

export async function translateMardown(
  file: string,
  targetFile: string,
  frontMatterKeys: TranslationKey[],
  url: string
) {
  if (!WEGLOT_URL) throw new Error("No weglot url");
  console.log("PROCESSING FILE", file, "TO TARGET", targetFile);
  const raw = await fs.readFile(file, { encoding: "utf-8" });
  const doc = markdoc.parse(raw);
  const wordsToTranslate: WordForTranslation[] = [];
  const frontmatter = doc.attributes.frontmatter
    ? (yaml.load(doc.attributes.frontmatter) as object)
    : false;
  if (frontmatter) {
    wordsToTranslate.push(
      ...extractObjectValuesForTranslation([frontmatter], frontMatterKeys)
    );
  }

  wordsToTranslate.push(...extractParagraphsFromMarkdown(doc));

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
    throw new Error(
      "Failed to get translation: " +
        (await result.text()) +
        " - " +
        result.status
    );
  }
  const parsed = (await result.json()) as { to_words: string[] };
  console.log("Translated - ", url);

  const translations = matchWordArrays(wordsToTranslate, parsed.to_words);
  let startAt = 0;

  if (frontmatter) {
    const v = setTranslatedValues(
      [frontmatter],
      frontMatterKeys,
      translations,
      0
    );
    startAt = v.next;
    doc.attributes.frontmatter = yaml.dump(v.result[0]);
    const updateSource = markdoc.format(doc);
    await fs.writeFile(file, updateSource, { encoding: "utf-8" });
    doc.attributes.frontmatter = undefined;
  }
  const translated = applyTranslationsToMarkdown(doc, translations, startAt);
  const newRaw = markdoc.format(translated.n, {
    allowIndentation: false,
    maxTagOpeningWidth: 9999,
  });
  await fs.writeFile(targetFile, `${newRaw}`, { encoding: "utf-8" });
}
