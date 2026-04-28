import { findMatchingMessages } from './src/lib/whatsappSearch';

async function main() {
  const intent = {
    searchTerms: [],
    dateRange: { start: '2026-01-02T00:00:00Z', end: '2026-01-03T00:00:00Z', ignoreYear: true },
    sender: null,
    isDirectMessageRequest: true,
    isAnotherRequest: false
  };
  const results = await findMatchingMessages(intent, 5, 0);
  console.log(results);
}
main();
