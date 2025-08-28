import "dotenv/config";
import path from "node:path";
import { translateAllYaml } from "./utils";

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
        keys: [{ key: "label" }],
      },
    ],
    { url: "/databaseGlobals" }
  );
}

Translate().then(() => console.log("Finished Translation"));
