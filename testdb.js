const lancedb = require("@lancedb/lancedb");
const path = require("path");

async function main() {
  const db = await lancedb.connect(path.join(process.cwd(), "desktop/.lancedb"));
  const table = await db.openTable("whatsapp_vectors");
  const query = new Array(384).fill(0.1);
  const res = await table.search(query).limit(1).execute();
  console.log("Is array:", Array.isArray(res));
  console.log("Type:", typeof res);
  //console.log("Keys:", Object.keys(res));
  if (!Array.isArray(res)) {
      console.log("constructor:", res.constructor.name);
  }
}
main().catch(console.error);
