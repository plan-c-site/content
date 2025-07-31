import roadTrips from "./road-trips.json" with { type: "json" };
import TurndownService from "npm:turndown";

const service = new TurndownService();

async function convert() {
  await Promise.all(
    roadTrips.map(async (v) => {
      const md = service.turndown(v.Description);
      const mdoc = `---
title: "${v.Name}"
city: "${v.City}"
state: "${v.State}"

---

${md}`;

      const slug = v.Slug;

      await Deno.writeTextFile(`./import/${slug}.mdoc`, mdoc);
    })
  );
}

convert();
