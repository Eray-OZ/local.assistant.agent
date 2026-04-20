# Personal Agentic Assistant — Project Plan

## Overview

A fully on-device macOS desktop app that acts as a personal AI assistant.
- No backend server, no cloud deployment
- Private data (WhatsApp, Notes) never leaves the device
- Cloud APIs only for Gmail (already stored on Google)

---

## Architecture

```text
Apple Silicon MacBook — Everything runs here
│
└── macOS Desktop App (Electron / Tauri + React)
    │
    ├── Gmail Module         → internet required, cloud OK
    │   ├── Google OAuth
    │   ├── Gmail REST API (fetch messages, apply labels)
    │   ├── Gemini API (categorize — Gmail already on Google)
    │   └── sqlite (processed email IDs, deduplication)
    │
    ├── WhatsApp Module      → FULLY LOCAL, no internet
    │   ├── .txt export import via native file picker
    │   ├── Parse (date / person / message)
    │   ├── sqlite (indexed messages)
    │   └── Local LLM → natural language search
    │
    ├── Notes Module         → FULLY LOCAL, no internet
    │   ├── Apple Notes / Text export import
    │   ├── Parse + chunk content
    │   ├── sqlite (indexed notes)
    │   └── Local LLM → natural language search
    │
    ├── Unified Agentic Search
    │   └── Local LLM decides which agent to invoke → merges results
    │
    └── Local LLM Runtime (Ollama / MLX / llama.cpp)
        Runs on Apple Silicon (M-Series) leveraging unified memory
```

## Privacy Policy

| Data | Goes to cloud? | Reason |
|---|---|---|
| Gmail | Yes (Gemini API) | Already on Google — acceptable |
| WhatsApp messages | No | On-device LLM only |
| Notes (Apple Notes) | No | On-device LLM only |
| Search queries (WA/Notes) | No | Fully local inference |

---

## Folder Structure

```text
personal.agentic.chat/
├── demo/                     ← Gmail pipeline proof-of-concept (Python)
│   ├── main.py
│   ├── fetch_emails.py
│   ├── process_emails.py
│   ├── apply_labels.py
│   ├── database.py
│   ├── test_connection.py
│   └── requirements.txt
├── desktop/                  ← Main macOS desktop app
│   ├── src/
│   │   ├── main/             (Backend: SQLite, LLM integrations, OS dialogs)
│   │   └── renderer/         (Frontend: React)
│   │       ├── pages/
│   │       │   ├── Index.tsx     (Dashboard)
│   │       │   ├── Emails.tsx    (Gmail categories + list)
│   │       │   ├── WhatsApp.tsx  (Import + NL search)
│   │       │   ├── Notes.tsx     (Import + NL search)
│   │       │   └── Search.tsx    (Unified agentic search)
│   │       ├── components/
│   │       │   ├── EmailCard.tsx
│   │       │   ├── MessageCard.tsx
│   │       │   ├── NoteCard.tsx
│   │       │   └── SearchBar.tsx
│   │       └── services/
│   │           ├── gmail.ts      (OAuth + Gmail API)
│   │           ├── whatsapp.ts   (parse + sqlite)
│   │           ├── notes.ts      (parse + sqlite)
│   │           └── llm.ts        (Local LLM wrapper)
│   ├── package.json
│   └── build/
├── PLAN.md                   ← This file
└── PROGRESS.md               ← Development log
```

---

## Tech Stack

| Technology | Choice | Reason |
|---|---|---|
| Framework | Electron/Tauri + React | Native desktop functionality for macOS |
| Local LLM | Ollama / MLX / node-llama-cpp | Best performance on Apple Silicon M-series chips |
| Database | better-sqlite3 / native sqlite | Fast, reliable local database for Desktop apps |
| File import | Native OS File Dialog | Access macOS file system natively |
| Gmail API | REST / Google APIs Node.js | Direct communication, no custom backend needed |
| Gemini API | REST / SDK | Direct communication, no custom backend needed |

---

## Phases

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Project setup (Desktop app skeleton + Local LLM + sqlite) | Pending |
| Phase 2 | Gmail Module (OAuth + fetch + categorize + label) | Pending |
| Phase 3 | WhatsApp Agent (import .txt + local NL search) | Pending |
| Phase 4 | Notes Agent (import .txt + local NL search) | Pending |
| Phase 5 | Unified Agentic Search | Pending |
