import "dotenv/config";
import path from "node:path";
import { translateAllYaml } from "./utils";

async function Translate() {
  console.log("Translating Articles");
  await translateAllYaml(
    path.join(__dirname, "../content/articles"),
    ["title", "summary"],
    { url: "/articles" }
  );
  await translateAllYaml(
    path.join(__dirname, "../content/resources"),
    ["heading", "summary", "buttonText"],
    { url: "/resources" }
  );
  await translateAllYaml(
    path.join(__dirname, "../content/testimonials"),
    ["testimonial", "source"],
    { url: "/testimonials" }
  );
}

Translate().then(() => console.log("Finished Translation"));
