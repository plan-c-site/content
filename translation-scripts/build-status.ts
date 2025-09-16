import "dotenv/config";
const clientConfig = {
  auth: process.env.NOCODB_TOKEN || "",
  baseUrl: process.env.NOCODB_SERVER || "",
};

const Id = process.env.BUILD_CONTROLLER_ID;
const Status = process.env.BUILD_CONTROLLER_STATUS;
const url = clientConfig.baseUrl + "/api/v2/tables/mr0t0b8iilyhqq7/records";

async function triggerUpdate() {
  if (!Id || !Status) {
    console.error("Cant update controller", Id, Status);
    return;
  }
  console.log(
    "Updating status in nocodb for controller " + Id + " To " + Status
  );

  await fetch(url, {
    method: "POST",
    headers: {
      "xc-token": clientConfig.auth,
    },
    body: JSON.stringify({
      Id: Number.parseInt(Id),
      Status: `${Status} - ${new Date().toISOString()}`,
    }),
  });
  console.log("Done updating status in nocodb");
}

triggerUpdate();
