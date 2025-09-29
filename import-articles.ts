import articles from "./articles.json" with { type: "json" };
import { stringify } from "jsr:@eemeli/yaml";

async function convert() {
  await Promise.all(
    articles.map(async (v) => {
      const value = {
        category: "plan-c",
        title: v.Name,
        author: v.Author,
        publication: v["Publication Name"],
        publicationDate: new Date(v["Published On"]).toISOString(),
        source: v["Source URL"],
      };

      const yaml = stringify(value);

      await Deno.writeTextFile(`./import/${v.Slug}.yaml`, yaml);
    })
  );
}

convert();
