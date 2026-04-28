import { parseQueryIntent } from './src/lib/queryParser';

async function main() {
  const result = await parseQueryIntent("2 ocak tarihinden bir mesaj");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
