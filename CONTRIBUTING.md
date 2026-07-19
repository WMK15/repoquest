# Contributing to RepoQuest

Thanks for your interest in making repository onboarding less painful. All
kinds of contributions are welcome: bug reports, UI polish, new mission
mechanics, adapter integrations, and documentation.

## Getting set up

```bash
git clone https://github.com/WMK15/repoquest.git
cd repoquest
pnpm install
pnpm dev          # http://localhost:3000
```

Optional — enable the AI mapping crew and chat by creating `.env.local`:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1   # optional override
```

Without a key the app still runs: repositories are mapped with the
deterministic structural fallback instead of the sub-agent pipeline.

## Project layout

| Path | What lives there |
| --- | --- |
| `app/` | Next.js App Router pages and API routes |
| `components/` | All UI (campaign shell, map, panels, chat) |
| `lib/campaign/` | Campaign types, Zod schemas, session store |
| `lib/agent/` | OpenAI clients and the Scout/Cartographer/Archivist pipeline |
| `lib/repository/` | Repo scanning, Markdown reading, path containment, cloning |
| `lib/repoquest/` | Contribution domain: adapters, services, engineer memory |
| `workspaces/` | Cloned repositories (gitignored, safe to delete) |

## Ground rules

These invariants keep RepoQuest safe to point at real repositories. PRs that
break them will be asked to change:

1. **The model never chooses filesystem paths or shell commands.** All file
   reads go through `resolveInsideRoot`; `.env*` files are always refused.
2. **All AI output is validated with Zod** before it reaches the UI, and every
   AI feature must degrade gracefully when no API key is configured.
3. **No fabricated results.** Verification states in the UI must reflect real
   command output — never mark something verified that wasn't.
4. **Secrets stay server-side.** Nothing from `process.env` may reach the
   client bundle.

## Workflow

1. Fork and create a feature branch from `main`.
2. Make your change. Match the surrounding code style (TypeScript strict,
   Tailwind utility classes, existing design tokens in `app/globals.css`).
3. Verify before pushing:

   ```bash
   npx tsc --noEmit
   pnpm lint
   pnpm build
   ```

4. For UI changes, include before/after screenshots in the PR — desktop
   (1440px) and narrow (~600px) widths.
5. Open a pull request using the template. Keep PRs focused; small and
   reviewable beats big and clever.

## Reporting bugs

Open an issue with the bug template. The most useful reports include the
repository you were mapping (if public), what you clicked, what you expected,
and a screenshot of what happened instead.

## Licence of contributions

By contributing you agree that your contributions are licensed under the
project's [AGPL-3.0](LICENSE) licence.
