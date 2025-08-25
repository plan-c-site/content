import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";

async function Translate() {
  const test = path.join(__dirname, "./.content/test-file");
  await fs.writeFile(test, `Currently: ${new Date().toISOString()}`);
}

Translate().then(() => console.log("Finished Translation"));
