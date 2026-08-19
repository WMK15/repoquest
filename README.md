# RepoQuest

**Turn a messy repo into a guided investigation.**

RepoQuest is an AI-powered onboarding environment. Point it at a repository —
a GitHub URL or a local path — and it reads the real documentation and source,
draws an interactive architecture map, and turns your first day on the
codebase into a short, evidence-driven campaign: explore regions, read the
knowledge archive, trace flows, and make a first bounded contribution with
verification.

<!-- Tech stack (self-hosted badges — no external service) -->
![Next.js 16.2](public/badges/nextjs.svg)
![OpenAI SDK 6.48](public/badges/openai.svg)
![pnpm 10](public/badges/pnpm.svg)
[![License: AGPL v3](public/badges/license.svg)](LICENSE)

**[▶ Watch the demo](https://giant-egret-456.convex.cloud/api/storage/f052ba2f-cbd2-4ca4-8ac3-98199b614c92)**

> RepoQuest began as a submission to the
> [Codex Community Hackathon (London)](https://luma.com/codex-hack-ldn?tk=Kxe1K7)
> and has since grown into an open-source project.

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
- **Detector-backed mapping** — bounded analyzers inventory JavaScript,
  TypeScript, Next.js, Tailwind/shadcn, SQL and common ORMs, Docker, Terraform,
  GitHub Actions, observability, and external-service signals. AI improves the
  prose without replacing the grounded topology.
- **Monorepo-aware atlas** — npm, pnpm, Yarn, and Bun workspaces are mapped with
  Turborepo/Nx tasks, package capabilities, and internal dependency edges.
- **Claim-level evidence** — cards explain responsibilities and runtime roles;
  paths, line ranges, detector claims, and excerpts stay behind `See sources`.
- **Coverage and walkthroughs** — RepoQuest reports what it found, did not
  detect, could not support, or could only partially analyze, then generates an
  ordered tour through applications, packages, data, infrastructure, and CI.
- **Exploration campaign** — regions start fogged; explore them in order,
  read their briefings and evidence, and earn XP as the map lights up.
- **Contribution workspace** — choose an evidence-backed candidate, then plan →
  approve → preview a bounded patch → apply → run every approved verification
  command → record mastery. The server, not the model, controls what can be
  touched.
- **Knowledge archive** — every Markdown document classified, summarised, and
  readable in-app.
- **Ask Codex** — a floating chat grounded in the mapped architecture and the
  actual document contents of the repository you're exploring.
- **Graceful degradation** — no API key? Deterministic mapping and exploration
  still work; AI-dependent planning and patch generation are clearly disabled.

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
        │  shallow clone / isolated Git worktree
        ▼
Inventory: bounded text, manifests, schemas, infrastructure, CI, and docs
        │
        ▼
Deterministic detector pipeline (streamed as NDJSON)
  workspaces · JS/TS · Next.js · UI · data · Docker · Terraform · CI · ops
        │
        ▼
RepositoryCampaign (Zod-validated)
  components · relationships · evidence · coverage · walkthrough · candidates
        │
        ▼
UI: atlas · hidden sources · guided exploration · contribution · chat
```

Detector output and the final campaign are parsed through Zod schemas and
reference-validated. Optional AI output can only enhance summaries; malformed
enhancements fall back to the deterministic map.

### Safety model

RepoQuest is designed to be safe to point at real repositories:

- The model **never chooses filesystem paths** — every read is containment-
  checked against the mapped repository root, and `.env*` files are refused.
- The model **never executes commands** — patches are bounded, previewed, and
  applied by server-controlled code only after explicit approval.
- Verification states in the UI reflect real output, never fabricated success.
- Cloned repositories live in `workspaces/` (gitignored, disposable).
- Local repositories must have at least one commit and a completely clean
  working tree. RepoQuest creates a dedicated `repoquest/*` branch in an
  isolated Git worktree under `workspaces/`; contribution changes do not touch
  the source checkout.

## Project structure

```
app/                    Next.js App Router pages + API routes
  api/campaign/         start (map a repo), investigate, reset
  api/contributions/    staged contribution flow (plan/patch/verify/mastery)
  api/chat/             grounded repository Q&A
components/             campaign shell, atlas, panels, chat, workspace
lib/campaign/           campaign types, Zod schemas, session store
lib/analysis/           inventory, evidence contracts, detectors, orchestration
lib/agent/              optional OpenAI summary and implementation adapters
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
