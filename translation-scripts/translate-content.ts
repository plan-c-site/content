import "dotenv/config";
import path from "node:path";
import {
  translateAllYaml,
  translateMarkdownValues,
  TranslationKey,
} from "./utils";

const SeoFields: TranslationKey[] = [
  {
    key: "title",
  },
  { key: "description" },
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
    [{ key: "heading" }, { key: "summary" }, { key: "buttonText" }],
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
                            keys: [{ key: "label" }],
                          },
                        ],
                      },
                      { has_condition: "link", keys: [{ key: "label" }] },
                    ],
                  },
                ],
              },
              { has_condition: "link", keys: [{ key: "label" }] },
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
    { url_base: "/databaseGlobals/" }
  );
}

Translate().then(() => console.log("Finished Translation"));
