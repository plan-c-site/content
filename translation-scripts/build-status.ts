import "dotenv/config";
import process from "node:process";
const clientConfig = {
  auth: process.env.NOCODB_TOKEN || "",
  baseUrl: process.env.NOCODB_SERVER || "",
};

const Id = process.env.BUILD_CONTROLLER_ID;
const Status = process.env.BUILD_CONTROLLER_STATUS;
const url = clientConfig.baseUrl + "/api/v2/tables/mr0t0b8iilyhqq7/records";

function formatDate(date: Date): string {
  return (
    date
      .toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
      .replace(",", "") + " PT"
  );
}

async function triggerUpdate() {
  if (!Id || !Status) {
    console.error("Cant update controller", Id, Status);
    return;
  }
  console.log(
    "Updating status in nocodb for controller " + Id + " To " + Status,
  );

  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      "xc-token": clientConfig.auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        Id: Number.parseInt(Id),
        Status: `${Status} - ${formatDate(new Date())}`,
      },
    ]),
  });
  console.log(
    "Done updating status in nocodb",
    `
    ${r.status}
    ${await r.text()}`,
  );
}

triggerUpdate();
