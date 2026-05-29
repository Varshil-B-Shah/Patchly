# Patchly — Implementation Plan Index
> Read this file first. Then read one phase file at a time as you work through it.

---

## What Patchly Is

A Chrome extension + local Node.js agent. Users select any area of a running localhost React+Vite+Tailwind app, describe a change in plain English, and the source code is automatically edited with the browser hot-reloading instantly.

No IDE searching. No file hunting. Just select and describe.

---

## Phase Files — Read One At A Time

| File | Phase | Goal | Est. Time |
|---|---|---|---|
| `PHASE_0_source_mapping_spike.md` | Spike | Prove DOM→source mapping works before building anything | 2–3 days |
| `PHASE_1_foundation_setup.md` | 1 | Skeleton, extension loads, agent runs, WebSocket confirmed | 3–4 days |
| `PHASE_2_visual_selection_layer.md` | 2 | Alt+Shift+P, rubber-band select, highlight, prompt bar | 4–5 days |
| `PHASE_3_source_mapping_real.md` | 3 | Real Vite plugin + sourceMapper, npx patchly init | 3–4 days |
| `PHASE_4_llm_integration.md` | 4 | Azure OpenAI call, preview toast with explanation | 3–4 days |
| `PHASE_5_file_writing_hmr.md` | 5 | Apply edit to file, Vite HMR, undo | 2–3 days |
| `PHASE_6_polish_readme.md` | 6 | Error handling, settings UI, README, ship | 3–4 days |

**Total estimated: 20–27 days of focused work.**

---

## Critical Rules

**Do not skip Phase 0.** It is a throwaway experiment that proves the hardest technical assumption. If source mapping doesn't work on your machine/setup, you need to know before writing 3 weeks of code.

**Do not start a phase until the previous phase's pass criteria are all checked.** Each phase has an explicit list. Do not move on with partial passes.

**Do not read ahead.** When working on Phase 2, do not read Phase 4. Future phase details will distract you and cause over-engineering.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome MV3, vanilla JS (no framework) |
| Agent | Node.js 18+, ESM modules |
| WebSocket | `ws` npm package |
| LLM (v1) | Azure OpenAI REST API |
| Source mapping | Custom Vite plugin using `@babel/parser`, `@babel/traverse`, `@babel/generator` |
| File editing (v1) | `fs` + string replace |
| Config | `.patchlyrc.json` + `chrome.storage.local` |

---

## Final Folder Structure (after all phases complete)

```
patchly/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── overlay.js
│   ├── overlay.css
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── assets/icons/
│
├── agent/
│   ├── index.js
│   ├── server.js
│   ├── sourceMapper.js
│   ├── fileEditor.js
│   ├── llm.js
│   └── config.js
│
├── vite-plugin/
│   └── index.js
│
├── bin/
│   └── init.js
│
├── shared/
│   └── protocol.js
│
├── package.json
├── README.md
└── .gitignore
```

---

## What Is Explicitly NOT In V1

These are real future features but are out of scope for v1. Do not implement them, do not plan for them, do not architect for them prematurely:

- AST-based editing (v1 uses string replace)
- Next.js support (v1 is Vite only)
- Vue/Svelte support
- Multi-provider LLM (v1 is Azure only)
- Team collaboration features
- Cloud hosting
- Screenshot context sent to LLM
- Drag-and-drop visual editing without prompts
- Multi-file edits

V1 does one thing: React+Vite+Tailwind, select area, prompt, file updated, hot reload.
