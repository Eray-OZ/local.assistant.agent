# Personal Agentic Assistant — Progress Log

---

## [2026-04-12] — Gmail Pipeline (Python Proof of Concept)

**Status:** Complete — moved to `demo/`

### What was built
- `test_connection.py` — Google OAuth flow, saves `token.json`, verifies Gmail connection
- `fetch_emails.py` — Fetches latest N emails from Gmail, extracts headers + body (HTML→text via BeautifulSoup), saves to `emails_data.json`
- `process_emails.py` — Sends emails to Gemini API, receives category + reason in JSON, saves to `categorized_emails.json`
- `apply_labels.py` — Creates Gmail labels if missing, applies category label to each email
- `database.py` — SQLite layer for deduplication (tracks processed email IDs, prevents re-processing)
- `main.py` — Orchestrates the full pipeline: fetch → categorize → label

### Key decisions
- Used `google-genai` new SDK (`client.models.generate_content`)
- SQLite deduplication: emails already in DB are skipped on next run
- Body truncated to 500 chars to limit token usage
- HTML body preferred over plain text, decoded via base64 + BeautifulSoup

---

## [Upcoming] — Phase 1: Mobile App Setup

- [ ] Create `mobile/` with `npx create-expo-app`
- [ ] Install: `expo-router`, `expo-sqlite`, `expo-auth-session`, `expo-document-picker`
- [ ] Install and configure `llama.rn` with Phi-3 Mini GGUF
- [ ] Tab navigation skeleton

---

## [Upcoming] — Phase 2: Gmail Module (React Native)

- [ ] Google OAuth with `expo-auth-session`
- [ ] Gmail REST API calls (fetch, label)
- [ ] Gemini API categorization
- [ ] expo-sqlite deduplication
- [ ] Gmail UI (category tabs + email list)

---

## [Upcoming] — Phase 3: WhatsApp Agent

- [ ] Import `.txt` export via `expo-document-picker`
- [ ] Parse WhatsApp format (date / sender / message)
- [ ] Index into expo-sqlite
- [ ] Natural language search via llama.rn
- [ ] WhatsApp UI (conversation list + search)

---

## [Upcoming] — Phase 4: Notes Agent

- [ ] Import Samsung Notes `.txt` export
- [ ] Parse + chunk content
- [ ] Index into expo-sqlite
- [ ] Natural language search via llama.rn
- [ ] Notes UI (list + search)

---

## [Upcoming] — Phase 5: Unified Agentic Search

- [ ] Single search input across all data sources
- [ ] llama.rn agent routing (which module to query)
- [ ] Merged results UI (chat-like)
