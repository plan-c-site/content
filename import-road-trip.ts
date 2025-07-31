import roadTrips from "./road-trips.json" with { type: "json" };
import TurndownService from "npm:turndown";
import { dateToString } from "https://deno.land/x/date_format_deno/mod.ts";

const service = new TurndownService();

async function convert() {
  await Promise.all(
    roadTrips.map(async (v) => {
      const md = service.turndown(v.Description);
      const date = new Date(v["Date + Time"]);
      const formattedDate = dateToString("yyyy-MM-dd", date);
      const mdoc = `---
title: "${v.Name.replaceAll(`"`, `\\"`)}"
city: "${v.City}"
state: "${v.State}"
date: "${formattedDate}"
organizationUrl: "${v["Organization URL"]}"
details: "${v["Event details URL"]}"
---

${md}`;

      const slug = v.Slug;

      await Deno.writeTextFile(`./import/${slug}.mdoc`, mdoc);
    })
  );
}

convert();
