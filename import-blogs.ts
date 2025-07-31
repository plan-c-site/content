import blogs from "./blogs.json" with { type: "json" };
import TurndownService from "npm:turndown";

const service = new TurndownService();

async function convert() {
  await Promise.all(
    blogs.map(async (v) => {
      const md = service.turndown(v.Content);
      const mdoc = `---
category: partnerships
title: "${v.Name}"
seo:
  image:
    discriminant: ''
headerImage:
  discriminant: uploaded
  value: mailbox
relatedPosts: []
---
{% bodySection
   centered=false
   width="default"
   color="beige"
   textSize="medium" %}
   ${md}
{% /bodySection %}`;

      const slug = v.Slug;

      await Deno.writeTextFile(`./import/${slug}.mdoc`, mdoc);
    })
  );
}

convert();
