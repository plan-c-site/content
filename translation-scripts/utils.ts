import fs from "fs/promises";
import { glob } from "glob";
import yaml from "js-yaml";
import crypto from "node:crypto";
import path from "node:path";
import markdoc, { Node } from "@markdoc/markdoc";
import { JSDOM } from "jsdom";

const API_KEY = process.env.WEGLOT_API_KEY || false;
const WEGLOT_URL = API_KEY
  ? `https://api.weglot.com/translate?api_key=${API_KEY}`
  : false;
const BASE_URL = process.env.BASE_URL || "https://www.ineedaplanc.org";
const FORCE_TRANSLATE = process.env.FORCE_TRANSLATE === "true";

const textTypes = {
  text: 1,
  title: 9,
  value: 2,
  placeholder: 3,
  meta: 4,
  img_alt: 7,
  external: 10,
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
          condition: string | boolean;
        }
    ))
  | { has_condition: string | boolean; keys: TranslationKey[] }
  | {
      has_condition: string | boolean;
      isString: true;
      type?: keyof typeof textTypes;
    };
type WordForTranslation = { w: string; t: number; hash: string } | string;
type WordFromTranslation = { w: string; hash: string } | string | { w: string };

async function weglotRequest(body: {
  l_from: string;
  l_to: string;
  request_url: string;
  words: { w: string; t: number }[];
}) {
  if (!WEGLOT_URL) throw new Error("No weglot url");
  const result = await fetch(WEGLOT_URL, {
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    method: "POST",
  });

  if (!result.ok) {
    if (result.status === 429) {
      console.warn("TOO MANY WEGLOT REQUESTS - DELAYING", body.request_url);
      return await new Promise<{ to_words: string[] }>((resolve, reject) => {
        setTimeout(() => {
          console.log("RESUMING WEGLOT REQUESTS", body.request_url);
          weglotRequest(body).then(resolve).catch(reject);
        }, 5000);
      });
    }
    throw new Error("Failed to get translation");
  }
  const parsed = (await result.json()) as { to_words: string[] };
  return parsed;
}

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
          if ("isString" in key) {
            return extractObjectValuesForTranslation(
              [value as object],
              [{ key: "value" }]
            );
          } else {
            return extractObjectValuesForTranslation(
              [value.value as object],
              key.keys
            );
          }
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
              (value[key.key].discriminant as string | boolean)) ||
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
        if (!FORCE_TRANSLATE && es["__" + key.key] === hash) {
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
          if ("isString" in key) {
            const result = setTranslatedValues(
              [{ value: value.value as string }],
              [{ key: "value" }],
              translations,
              next,
              override
            );
            next = result.next;
            nv["discriminant"] = value.discriminant;
            nv["value"] = result.result[0]["value"];
            return nv;
          } else {
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
          es["__" + key.key] = "hash" in translation ? translation.hash : "";
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

  const parsed = await weglotRequest(body);
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

export const clickEventTranslation: (key: string) => TranslationKey[] = (
  key: string
) => [
  {
    key,
    container: "object",
    condition: "external",
    keys: [{ key: "url", type: "external" }],
  },
];

export const imageReferenceTranslation: (key: string) => TranslationKey[] = (
  key: string
) => [
  {
    key,
    condition: "noco-with-alt",
    container: "object",
    keys: [{ key: "altText" }],
  },
  {
    key,
    condition: "one-off",
    container: "object",
    keys: [{ key: "altText" }],
  },
  { key, condition: "state", container: "object", keys: [{ key: "altText" }] },
];

const sectionTranslations: Record<string, TranslationKey[]> = {
  actionBanner: [
    { key: "title" },
    {
      key: "link",
      container: "object",
      keys: [{ key: "label" }, ...clickEventTranslation("click")],
    },
  ],
  cardSection: [
    { key: "title" },
    { key: "label" },
    ...clickEventTranslation("action"),
  ],
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
              condition: false,
              keys: [{ key: "label" }],
            },
          ],
        },
      ],
    },
  ],
  inContentButton: [{ key: "label" }, ...clickEventTranslation("action")],
  inContentDropdown: [
    { key: "label" },
    {
      key: "options",
      container: "array",
      keys: [
        {
          has_condition: "link",
          keys: [{ key: "label" }, ...clickEventTranslation("action")],
        },
        {
          has_condition: "label",
          isString: true,
        },
      ],
    },
  ],
  inContentImage: [...clickEventTranslation("action")],
  inlineLink: [...clickEventTranslation("action")],
  logoBanner: [{ key: "title" }],
  sectionHeader: [{ key: "title" }],
  timelineSection: [{ key: "title" }],
  toDoSection: [{ key: "title" }],
  tocAnchor: [
    { key: "slug", container: "object", keys: [{ key: "name" }] },
    {
      key: "type",
      container: "object",
      condition: "action",
      keys: [{ has_condition: "external", isString: true, type: "external" }],
    },
  ],
  resourceItem: [
    {
      key: "header",
      container: "object",
      keys: [{ has_condition: "override", isString: true }],
    },
  ],
  resourceList: [
    {
      key: "resources",
      container: "array",
      keys: [{ key: "header", type: "text" }],
    },
  ],
  postList: [
    {
      key: "type",
      container: "object",
      condition: "headlines",
      keys: [{ key: "buttonLabel" }],
    },
  ],
};

function processInlineMarkdown(
  node: Node,
  soFar: number
): { internalString: string; soFar: number; attributes: WordForTranslation[] } {
  let innerSoFar = soFar;
  let internalString = "";
  let attributes: WordForTranslation[] = [];
  if (
    "content" in node.attributes &&
    typeof node.attributes.content === "string"
  ) {
    innerSoFar++;
    internalString = `<span wg-${innerSoFar}>${node.attributes.content}</span>`;
    return { internalString, soFar: innerSoFar, attributes };
  } else if (node.tag && sectionTranslations[node.tag]) {
    attributes = extractObjectValuesForTranslation(
      [node.attributes],
      sectionTranslations[node.tag]
    );
  }

  innerSoFar++;
  internalString = `<span wg-${innerSoFar}>`;
  for (const n of node.children) {
    const result = processInlineMarkdown(n, innerSoFar);
    internalString += result.internalString;
    (innerSoFar = result.soFar), attributes.push(...result.attributes);
  }
  internalString += `</span>`;
  return { internalString, soFar: innerSoFar, attributes };
}

function processParagraphFromMarkdown(node: Node): WordForTranslation[] {
  let interiorString = "";
  let soFar = 0;
  let words: WordForTranslation[] = [];
  for (const n of node.children) {
    const r = processInlineMarkdown(n, soFar);
    interiorString += r.internalString;
    soFar = r.soFar;
    words.push(...r.attributes);
  }
  return [{ w: `${interiorString}`, t: textTypes.text, hash: "" }, ...words];
}

function extractParagraphsFromMarkdown(node: Node): WordForTranslation[] {
  if (
    "_language" in node.attributes &&
    typeof node.attributes._language === "string" &&
    node.attributes._language !== ""
  ) {
    return [];
  }
  if (node.type === "inline") {
    return processParagraphFromMarkdown(node);
  }
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

function applyInlineTranslations(
  node: Node,
  translations: WordFromTranslation[],
  startAt: number,
  html: HTMLElement
): { n: Node; next: number } {
  if (
    "content" in node.attributes &&
    typeof node.attributes.content === "string"
  ) {
    return {
      next: startAt,
      n: new Node(node.type, { content: html.textContent }, [], node.tag),
    };
  }
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
  for (let t = 0; t < node.children.length; t++) {
    const el = html.children[t] as HTMLElement;
    const n = node.children[t];
    if (el) {
      const result = applyInlineTranslations(n, translations, i, el);
      i = result.next;
      children.push(result.n);
    } else {
      throw new Error(
        `MISMATCH, ${t}
        ${html.outerHTML}
        ${JSON.stringify(node, null, 2)}`
      );
    }
  }
  const n = new Node(node.type, attributes, children, node.tag);
  n.inline = node.inline;
  return {
    n,
    next: i,
  };
}

function applyTranslationsToParagraph(
  node: Node,
  translations: WordFromTranslation[],
  startAt: number
): { n: Node; next: number } {
  const html = translations[startAt] as { w: string };
  let next = startAt + 1;
  const parsed = new JSDOM(`<html><body>${html.w}</body></html>`);
  const body = parsed.window.document.body;

  const children: Node[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const el = body.children[i] as HTMLElement;
    const n = node.children[i];
    if (el) {
      const result = applyInlineTranslations(n, translations, next, el);
      next = result.next;
      children.push(result.n);
    }
  }

  const n = new Node("inline", {}, children);
  n.inline = node.inline;

  return { n, next };
}

function applyTranslationsToMarkdown(
  node: Node,
  translations: WordFromTranslation[],
  startAt: number
): { n: Node; next: number } {
  if (
    "_language" in node.attributes &&
    typeof node.attributes._language === "string" &&
    node.attributes._language !== ""
  ) {
    return {
      n: node,
      next: startAt,
    };
  }
  if (node.type === "inline") {
    const result = applyTranslationsToParagraph(node, translations, startAt);
    return result;
  }
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
  }
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

export async function translateMardown(
  file: string,
  targetFile: string,
  frontMatterKeys: TranslationKey[],
  url: string
) {
  if (!WEGLOT_URL) throw new Error("No weglot url");
  console.log("PROCESSING FILE", file, "TO TARGET", targetFile);
  const raw = await fs.readFile(file, { encoding: "utf-8" });
  const hash = crypto.createHash("sha256").update(raw).digest("base64");
  if (!FORCE_TRANSLATE) {
    try {
      const hashFile = await fs.readFile(file + ".hash", { encoding: "utf-8" });
      if (hashFile === hash) {
        console.log("File unchanged - ", file);
        return;
      }
    } catch {}
  }
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
  const parsed = await weglotRequest(body);
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
    maxTagOpeningWidth: 9999999,
  });
  await fs.writeFile(targetFile, `${newRaw}`, { encoding: "utf-8" });
  //await fs.writeFile(file + ".hash", hash, { encoding: "utf-8" });
}
