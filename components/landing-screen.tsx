"use client";

import { useState } from "react";
import { FolderGit2 } from "lucide-react";

export function LandingScreen({
  onBegin,
}: {
  onBegin: (repoInput: string) => void;
}) {
  const [repoInput, setRepoInput] = useState("");

  return (
    <main className="rq-grid-bg relative min-h-screen overflow-hidden px-5 py-6 text-white sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between py-3">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.32em] text-white/70">
            RepoQuest
          </p>
          <p className="hidden rounded-full border border-white/15 bg-white/8 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-white/70 sm:block">
            Repository onboarding game
          </p>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.02fr_0.98fr] lg:py-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-white/75 shadow-2xl shadow-primary/20 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_14px_rgba(34,197,94,0.9)]" />
              Learn unfamiliar code by playing through it
            </div>

            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">
              Turn a messy repo into a guided investigation.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200/78 sm:text-xl">
              RepoQuest scans a codebase, builds a system map, and turns onboarding into a short evidence-driven campaign instead of a folder safari.
            </p>

            <form
              id="map-repo"
              className="mt-8 grid max-w-2xl gap-2 rounded-2xl border border-white/14 bg-black/22 p-2 shadow-2xl shadow-black/20 backdrop-blur sm:grid-cols-[1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                if (repoInput.trim()) onBegin(repoInput.trim());
              }}
            >
              <label htmlFor="repo-input" className="sr-only">
                GitHub URL or local repository path
              </label>
              <input
                id="repo-input"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="github.com/owner/repo or /path/to/local/repo"
                className="min-w-0 rounded-xl border border-white/12 bg-white px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted focus:border-primary/70 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!repoInput.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/16 disabled:opacity-45"
              >
                <FolderGit2 className="h-4 w-4 text-sky" aria-hidden />
                Generate map
              </button>
            </form>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-primary/30 via-white/8 to-black/30 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.7rem] border border-white/16 bg-slate-950/72 p-4 shadow-2xl shadow-black/35 backdrop-blur-xl">
              <p className="text-center font-mono text-sm text-white/60">
                Enter a repository URL or local path to get started.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
