"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FolderGit2, GitBranch } from "lucide-react";

const PREVIEW_NODES = [
  "Entry Terminal",
  "Identity Relay",
  "Token Forge",
  "Access Gate",
  "User Vault",
];

const PROOF_POINTS = [
  { label: "Maps code", value: "source, docs, edges" },
  { label: "Guides learning", value: "one region at a time" },
  { label: "Finds evidence", value: "files tied to claims" },
];

export function LandingScreen({
  onBegin,
  onBeginExternal,
}: {
  onBegin: () => void;
  onBeginExternal: (repoInput: string) => void;
}) {
  const [litIndex, setLitIndex] = useState(0);
  const [repoInput, setRepoInput] = useState("");

  // Small animated system preview: a pulse walking the request path.
  useEffect(() => {
    const t = setInterval(
      () => setLitIndex((i) => (i + 1) % PREVIEW_NODES.length),
      900
    );
    return () => clearInterval(t);
  }, []);

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

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onBegin}
                className="rq-cta rq-glow-primary inline-flex items-center justify-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
              >
                Start the demo campaign
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <a
                href="#map-repo"
                className="inline-flex items-center justify-center rounded-xl border border-white/18 bg-white/8 px-6 py-3.5 text-base font-semibold text-white/86 backdrop-blur transition hover:border-white/35 hover:bg-white/12"
              >
                Map your own repo
              </a>
            </div>

            <form
              id="map-repo"
              className="mt-6 grid max-w-2xl gap-2 rounded-2xl border border-white/14 bg-black/22 p-2 shadow-2xl shadow-black/20 backdrop-blur sm:grid-cols-[1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                if (repoInput.trim()) onBeginExternal(repoInput.trim());
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
              <div className="rounded-[1.25rem] border border-white/12 bg-white/[0.06] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.24em] text-white/48">
                      Demo campaign
                    </p>
                    <p className="mt-1 flex items-center gap-2 font-mono text-sm text-white">
                      <GitBranch className="h-4 w-4 text-sky" aria-hidden />
                      PulseBoard
                    </p>
                  </div>
                  <p className="rounded-full border border-white/12 px-3 py-1 font-mono text-[0.65rem] text-white/60">
                    6 files · 5 docs
                  </p>
                </div>

                <div className="mt-6 space-y-3">
                  {PREVIEW_NODES.map((label, i) => (
                    <div key={label} className="grid grid-cols-[1.5rem_1fr] items-center gap-3">
                      <div
                        className={`h-3 w-3 rounded-full transition-all duration-500 ${
                          i === litIndex
                            ? "bg-primary shadow-[0_0_24px_rgba(37,99,235,1)]"
                            : i < litIndex
                              ? "bg-sky/80"
                              : "bg-white/20"
                        }`}
                      />
                      <div
                        className={`rounded-xl border px-4 py-3 transition-all duration-500 ${
                          i === litIndex
                            ? "border-primary/80 bg-primary/18 text-white"
                            : "border-white/10 bg-white/[0.04] text-white/58"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-mono text-xs">{label}</p>
                          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-white/40">
                            {i === litIndex ? "reading" : "mapped"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-success/25 bg-success/10 p-4">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-success">
                    Current objective
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/78">
                    Read the evidence, identify the risky subsystem, then unlock the next region of the map.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 pb-8 sm:grid-cols-3">
          {PROOF_POINTS.map((point) => (
            <div
              key={point.label}
              className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur"
            >
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-white/48">
                {point.label}
              </p>
              <p className="mt-2 text-sm font-medium text-white/84">{point.value}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
