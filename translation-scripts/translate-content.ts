import "dotenv/config";
import path from "node:path";
import {
  clickEventTranslation,
  translateAllYaml,
  translateMarkdownRoots,
  translateMarkdownValues,
  TranslationKey,
} from "./utils";

const SeoFields: TranslationKey[] = [
  {
    key: "title",
    type: "meta",
  },
  { key: "description", type: "meta" },
];

async function Translate() {
  console.log("Translating Articles");
  await translateAllYaml(
    path.join(__dirname, "../content/articles"),
    [{ key: "title" }, { key: "summary" }],
    { url: "/articles" }
  );
  await translateAllYaml(
    path.join(__dirname, "../content/resources"),
    [
      { key: "heading" },
      { key: "summary" },
      { key: "buttonText" },
      ...clickEventTranslation("buttonAction"),
    ],
    { url: "/resources" }
  );
  await translateAllYaml(
    path.join(__dirname, "../content/testimonials"),
    [{ key: "testimonial" }, { key: "source" }],
    { url: "/testimonials" }
  );

  await translateAllYaml(
    path.join(__dirname, "../databaseGlobals"),
    [
      { key: "medicallySafeLabel" },
      { key: "howManyPillsLabel" },
      {
        key: "clinicTypes",
        keys: [
          { key: "label" },
          { key: "singular" },
          { key: "labels", container: "array", keys: [{ key: "label" }] },
        ],
        container: "array",
      },
      {
        key: "filterFields",
        container: "array",
        keys: [
          { key: "label" },
          {
            key: "selectType",
            condition: "single",
            container: "array",
            keys: [{ key: "label" }],
          },
          {
            key: "selectType",
            condition: "multi",
            container: "array",
            keys: [{ key: "label" }],
          },
          {
            key: "selectType",
            condition: "number",
            keys: [{ key: "anyLabel" }, { key: "numberLabel" }],
            container: "object",
          },
          {
            key: "helpPopup",
            condition: "true",
            container: "object",
            keys: [{ key: "label" }],
          },
        ],
      },
      {
        key: "seo",
        keys: SeoFields,
        container: "object",
      },
    ],
    { url: "/databaseGlobals" }
  );

  await translateAllYaml(
    path.join(__dirname, "../navigation"),
    [
      {
        key: "messageBar",
        container: "object",
        keys: [
          {
            key: "text",
          },
          { key: "quickExitText" },
        ],
      },
      {
        key: "externalLink",
        container: "object",
        keys: [
          {
            key: "title",
          },
          { key: "dontShowAgainText" },
          { key: "continueText" },
        ],
      },
      {
        key: "social",
        container: "array",
        keys: [...clickEventTranslation("action")],
      },
      {
        key: "navBar",
        container: "object",
        keys: [
          {
            key: "links",
            container: "array",
            keys: [
              {
                has_condition: "section",
                keys: [
                  { key: "label" },
                  {
                    key: "children",
                    container: "array",
                    keys: [
                      {
                        has_condition: "section",
                        keys: [
                          { key: "label" },
                          {
                            key: "children",
                            container: "array",
                            keys: [
                              { key: "label" },
                              ...clickEventTranslation("action"),
                            ],
                          },
                        ],
                      },
                      {
                        has_condition: "link",
                        keys: [
                          { key: "label" },
                          ...clickEventTranslation("action"),
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                has_condition: "link",
                keys: [{ key: "label" }, ...clickEventTranslation("action")],
              },
            ],
          },
        ],
      },
    ],
    { url: "/navigation" }
  );

  await translateAllYaml(path.join(__dirname, "../seo"), SeoFields, {
    url: "/seo-defaults",
  });

  await translateMarkdownValues(
    path.join(__dirname, "../databaseGlobals"),
    [],
    { url_base: "/databaseGlobals" }
  );

  await translateMarkdownRoots(
    path.join(__dirname, "../content/pages"),
    [
      { key: "title", type: "title" },
      {
        key: "seo",
        keys: SeoFields,
        container: "object",
      },
    ],
    "content",
    { url_base: "/pages" }
  );
  await translateMarkdownRoots(
    path.join(__dirname, "../content/faq"),
    [{ key: "question", type: "title" }],
    "answer",
    { url_base: "/faq" }
  );
  await translateMarkdownRoots(
    path.join(__dirname, "../content/popups"),
    [{ key: "title" }],
    "answer",
    { url_base: "/popups" }
  );
  await translateMarkdownRoots(
    path.join(__dirname, "../content/posts"),
    [
      { key: "title", type: "title" },
      { key: "summary" },
      {
        key: "seo",
        keys: SeoFields,
        container: "object",
      },
    ],
    "answer",
    { url_base: "/posts" }
  );
  await translateMarkdownRoots(
    path.join(__dirname, "../content/roadTrip"),
    [{ key: "title" }, { key: "city" }],
    "description",
    { url_base: "/roadTrip" }
  );
}

Translate().then(() => console.log("Finished Translation"));
