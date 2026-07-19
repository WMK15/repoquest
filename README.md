# RepoQuest

**Turn a messy repo into a guided investigation.**

RepoQuest is an AI-powered onboarding environment. Point it at a repository —
a GitHub URL or a local path — and it reads the real documentation and source,
draws an interactive architecture map, and turns your first day on the
codebase into a short, evidence-driven campaign: explore regions, read the
knowledge archive, trace flows, and make a first bounded contribution with
verification.

<!-- Maintenance -->
[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-brightgreen.svg)](https://github.com/WMK15/repoquest/graphs/commit-activity)
[![Last commit](https://img.shields.io/github/last-commit/WMK15/repoquest/main?style=flat)](https://github.com/WMK15/repoquest/commits/main)
[![Issues](https://img.shields.io/github/issues-raw/WMK15/repoquest?style=flat)](https://github.com/WMK15/repoquest/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

<!-- Tech stack -->
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white)

---

## Why

The hardest part of joining an engineering team is building a mental model of
a system everyone else already understands. READMEs go stale, tribal knowledge
lives in people's heads, and "just read the code" means six hours of folder
safari. RepoQuest replaces that with a guided investigation grounded in the
actual repository — its docs are treated as evidence, its source as the final
authority.

## Features

- **Map any repository** — paste `github.com/owner/repo` (shallow-cloned
  locally) or a path to a repo on your machine.
- **Sub-agent mapping crew** — three specialist agents work in sequence and
  stream their real activity live: **Scout** reads the Markdown knowledge
  archive, **Cartographer** surveys the file tree and representative source to
  draw regions and dependency edges, **Archivist** links documents to regions
  and flags contradictions between docs and code.
- **Interactive system atlas** — a React Flow map of architecture regions with
  status, source files, doc links, and a details drawer per region.
- **Exploration campaign** — regions start fogged; explore them in order,
  read their briefings and evidence, and earn XP as the map lights up.
- **Contribution workspace** — a staged first contribution: plan → approve →
  preview a bounded patch → apply → verify → record mastery. The server, not
  the model, controls what can be touched.
- **Knowledge archive** — every Markdown document classified, summarised, and
  readable in-app.
- **Ask Codex** — a floating chat grounded in the mapped architecture and the
  actual document contents of the repository you're exploring.
- **Graceful degradation** — no API key? Everything still works with a
  deterministic structural map instead of the AI crew.

## Quick start

Requires Node.js ≥ 20 and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/WMK15/repoquest.git
cd repoquest
pnpm install
pnpm dev
```

Open http://localhost:3000 and map a repository.

### Enabling the AI crew (optional)

Create `.env.local`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1   # optional, this is the default
```

The key stays server-side and is never committed or sent to the browser.
Check `GET /api/health` to confirm — `"aiConfigured": true`.

## How it works

```
Repository (GitHub URL or local path)
        │  shallow clone / mount
        ▼
Scan: file tree + prioritised Markdown (README, AGENTS.md, docs/**, ADRs…)
        │
        ▼
Sub-agent pipeline (streamed as NDJSON to the boot screen)
  Scout ─► Cartographer ─► Archivist
        │
        ▼
RepositoryCampaign (Zod-validated)
  regions · edges · knowledge archive · contradictions · mission
        │
        ▼
UI: system atlas · exploration game · contribution workspace · chat
```

Every AI response is parsed through Zod schemas; anything malformed falls back
to a deterministic campaign built from the directory structure alone.

### Safety model

RepoQuest is designed to be safe to point at real repositories:

- The model **never chooses filesystem paths** — every read is containment-
  checked against the mapped repository root, and `.env*` files are refused.
- The model **never executes commands** — patches are bounded, previewed, and
  applied by server-controlled code only after explicit approval.
- Verification states in the UI reflect real output, never fabricated success.
- Cloned repositories live in `workspaces/` (gitignored, disposable).

## Project structure

```
app/                    Next.js App Router pages + API routes
  api/campaign/         start (map a repo), investigate, reset
  api/contributions/    staged contribution flow (plan/patch/verify/mastery)
  api/chat/             grounded repository Q&A
components/repoquest/   campaign shell, atlas, panels, chat, workspace
lib/campaign/           campaign types, Zod schemas, session store
lib/agent/              OpenAI clients + Scout/Cartographer/Archivist pipeline
lib/repository/         scanning, Markdown reading, cloning, path containment
lib/repoquest/          contribution domain: adapters, services, memory
```

## Contributing

Contributions are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for
setup, the safety invariants PRs must respect, and the verification checklist.
Please also read our [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? Please follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## License

Copyright © 2026 Waseef Mohammad Khan.

RepoQuest is open source under the [GNU AGPL v3](LICENSE). You are free to
use, modify, and distribute it — but if you run a modified version as a
network service, you must make your modified source available under the same
license. For commercial licensing outside AGPL terms, contact
waseef@seractech.co.uk.
