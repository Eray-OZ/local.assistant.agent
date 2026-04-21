import * as lancedb from "@lancedb/lancedb";
import path from "path";

async function main() {
    const dbPath = path.resolve(process.cwd(), "desktop/.lancedb");
    const db = await lancedb.connect(dbPath);
    const tables = await db.tableNames();
    console.log("Tables:", tables);
    if(tables.includes('whatsapp_chunks')){
        const tbl = await db.openTable('whatsapp_chunks');
        console.log("Count:", await tbl.countRows());
    }
}
main();
