import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  analyzeRepository,
  buildRepositoryInventory,
  classifyRepositoryFile,
  readInventoryTextFiles,
} from "../lib/analysis";
import { buildAnalysisCampaign } from "../lib/campaign/analysis-campaign";
import { detectDatabases } from "../lib/analysis/detectors/databases";
import { detectDocker } from "../lib/analysis/detectors/docker";
import { detectGitHubActions } from "../lib/analysis/detectors/github-actions";
import { detectExternalServices } from "../lib/analysis/detectors/external-services";
import { detectObservability } from "../lib/analysis/detectors/observability";
import { detectJavaScriptTypeScript } from "../lib/analysis/detectors/ecosystems/javascript-typescript";
import { detectMonorepo } from "../lib/analysis/detectors/monorepo";
import { detectNextJs } from "../lib/analysis/detectors/nextjs";
import { detectTailwindShadcn } from "../lib/analysis/detectors/tailwind-shadcn";
import { detectTerraform } from "../lib/analysis/detectors/terraform";

const fixtureRoot = fileURLToPath(new URL("./fixtures/js-monorepo", import.meta.url));

interface GroundedEvidence {
  path: string;
  line?: number;
  snippet?: string;
}

interface Finding {
  type?: string;
  kind?: string;
  label?: string;
  name?: string;
  evidence: GroundedEvidence[];
}

async function fixtureInput(paths: string[]) {
  return Promise.all(
    paths.map(async (relativePath) => ({
      path: relativePath,
      content: await fs.readFile(path.join(fixtureRoot, relativePath), "utf8"),
    }))
  );
}

async function expectGrounded(findings: Finding[], inventoryPaths: Set<string>) {
  expect(findings.length).toBeGreaterThan(0);
  for (const finding of findings) {
    expect(finding.evidence.length, `${finding.type ?? finding.kind}: ${finding.label ?? finding.name}`).toBeGreaterThan(0);
    for (const evidence of finding.evidence) {
      expect(inventoryPaths.has(evidence.path), evidence.path).toBe(true);
      const content = await fs.readFile(path.join(fixtureRoot, evidence.path), "utf8");
      if (evidence.line !== undefined) {
        const sourceLine = content.split(/\r?\n/)[evidence.line - 1];
        expect(sourceLine, `${evidence.path}:${evidence.line}`).toBeDefined();
        if (evidence.snippet !== undefined) {
          expect(evidence.snippet).toBe(sourceLine.trim().slice(0, 240));
        }
      }
    }
  }
}

describe("repository inventory", () => {
  test.each([
    ["src/index.ts", "typescript"],
    ["scripts/release.mjs", "javascript"],
    ["db/schema.sql", "sql"],
    ["db/schema.prisma", "source"],
    ["app/globals.pcss", "source"],
    ["components.json", "config"],
    ["pnpm-lock.yaml", "manifest"],
    ["uv.lock", "manifest"],
    ["README.md", "documentation"],
    ["package.json", "package"],
    ["Dockerfile", "docker"],
    ["infra/main.tf", "terraform"],
    [".github\\workflows\\ci.yml", "github-actions"],
    ["public/logo.svg", "asset"],
  ] as const)("classifies %s as %s", (file, category) => {
    expect(classifyRepositoryFile(file)).toBe(category);
  });

  test("inventories the fixture with normalized categories and readable source files", async () => {
    const inventory = await buildRepositoryInventory(fixtureRoot);
    const byPath = new Map(inventory.files.map((file) => [file.path, file]));

    expect(inventory.totalFiles).toBe(inventory.files.length);
    expect(inventory.root).toBe(path.resolve(fixtureRoot));
    expect(byPath.get("apps/web/app/page.tsx")).toMatchObject({ category: "typescript", safeToRead: true });
    expect(byPath.get("packages/db/prisma/migrations/001_init/migration.sql")).toMatchObject({ category: "sql", safeToRead: true });
    expect(byPath.get("Dockerfile")?.category).toBe("docker");
    expect(byPath.get("infra/main.tf")?.category).toBe("terraform");
    expect(byPath.get(".github/workflows/ci.yml")?.category).toBe("github-actions");
    expect(byPath.get("packages/db/prisma/schema.prisma")?.safeToRead).toBe(true);
    expect(byPath.get("apps/web/app/globals.css")?.safeToRead).toBe(true);
    expect(byPath.get("apps/web/components.json")?.safeToRead).toBe(true);
    expect(byPath.get("pnpm-lock.yaml")?.safeToRead).toBe(true);
    expect(inventory.categoryCounts.package).toBe(4);
  });

  test("inventories lockfiles but applies bounded reads", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repoquest-large-lock-"));
    try {
      await fs.writeFile(path.join(root, "uv.lock"), Buffer.alloc(1024 * 1024 + 1, 97));
      const inventory = await buildRepositoryInventory(root);
      const lockfile = inventory.files.find(({ path: file }) => file === "uv.lock");
      expect(lockfile).toMatchObject({ category: "manifest", safeToRead: true });
      const readable = await readInventoryTextFiles(root, inventory);
      expect(readable.files).toEqual([]);
      expect(readable.limitedPaths.has("uv.lock")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("representative JavaScript monorepo fixture", () => {
  test("runs supported text formats through the production inventory and sandbox", async () => {
    const analysis = await analyzeRepository(fixtureRoot);
    const evidencePaths = new Set(analysis.evidence.map((item) => item.path));

    expect(evidencePaths.has("packages/db/prisma/schema.prisma")).toBe(true);
    expect(evidencePaths.has("apps/web/app/globals.css")).toBe(true);
    expect(evidencePaths.has("apps/web/components.json")).toBe(true);
    expect([...evidencePaths].some((file) => file.includes("/generated/"))).toBe(false);
    expect(analysis.contributionCandidates.some((candidate) => /pin .*commit sha/i.test(candidate.title))).toBe(false);

    const campaign = buildAnalysisCampaign("fixture", analysis, []);
    const repositoryNode = campaign.nodes.find((node) => node.id === "component:repository");

    expect(repositoryNode?.dependencies).toBeUndefined();
    expect(repositoryNode?.responsibilities).toEqual(
      expect.arrayContaining([expect.stringContaining("workspace package")])
    );
    expect(repositoryNode?.entryPoints).toEqual(expect.arrayContaining(["README.md", "package.json"]));
    expect(campaign.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "component:repository", kind: "contains" }),
      ])
    );
    expect(campaign.analysisCoverage?.find(({ area }) => area === "backend")?.status).toBe("found");
    expect(campaign.summary).toContain("files inventoried");
    expect(campaign.summary).not.toContain("files analyzed");

    const campaignWithDocs = buildAnalysisCampaign("fixture", analysis, [{
      path: "README.md",
      title: "Fixture monorepo",
      kind: "overview",
      content: "# Fixture monorepo",
      headings: ["Fixture monorepo"],
      frontmatter: {},
      priority: 1,
    }]);
    expect(campaignWithDocs.contributionCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "documentation",
          paths: ["README.md"],
          evidenceIds: expect.arrayContaining([expect.any(String)]),
        }),
      ])
    );
  });

  test("detects workspace, Next.js, Tailwind/shadcn, SQL, and module signals", async () => {
    const inventory = await buildRepositoryInventory(fixtureRoot);
    const inventoryPaths = new Set(inventory.files.map((file) => file.path));
    const outputs = await Promise.all([
      detectMonorepo(fixtureRoot),
      detectNextJs(fixtureRoot),
      detectTailwindShadcn(fixtureRoot),
      detectDatabases(fixtureRoot),
      detectJavaScriptTypeScript(fixtureRoot),
    ]);
    const [monorepo, next, styling, database, modules] = outputs;

    expect(monorepo.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining(["workspace-pattern", "workspace-package", "internal-dependency"]));
    expect(next.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining(["framework", "app-page-route", "execution-boundary"]));
    expect(styling.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining(["tailwind-package", "tailwind-v4-entry", "shadcn-config", "shadcn-component"]));
    expect(database.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining(["database-package", "sql-migration", "sql-ddl"]));
    expect(modules.findings.map((finding) => finding.type)).toEqual(expect.arrayContaining(["module-import", "tsconfig-alias"]));

    expect(monorepo.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "workspace-package", details: expect.objectContaining({ name: "@fixture/web", directory: "apps/web" }) }),
      expect.objectContaining({ type: "internal-dependency", details: expect.objectContaining({ from: "@fixture/web", to: "@fixture/ui" }) }),
      expect.objectContaining({ type: "internal-dependency", details: expect.objectContaining({ from: "@fixture/web", to: "@fixture/db" }) }),
      expect.objectContaining({ type: "task-runner", label: "Turborepo", details: expect.objectContaining({ workspaceRoot: "" }) }),
      expect.objectContaining({ type: "nx-project", details: expect.objectContaining({ projectRoot: "apps/web" }) }),
    ]));
    expect(next.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "framework", evidence: [expect.objectContaining({ path: "apps/web/package.json" })] }),
      expect.objectContaining({ type: "next-config", evidence: [expect.objectContaining({ path: "apps/web/next.config.ts" })] }),
      expect.objectContaining({ type: "app-page-route", details: expect.objectContaining({ route: "/blog/[slug]" }) }),
      expect.objectContaining({ type: "pages-api-route", details: expect.objectContaining({ route: "/api/health" }) }),
    ]));
    expect(styling.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tailwind-package", details: expect.objectContaining({ packageRoot: "apps/web" }) }),
      expect.objectContaining({ type: "tailwind-config", evidence: [expect.objectContaining({ path: "packages/ui/tailwind.config.ts" })] }),
      expect.objectContaining({ type: "shadcn-config", evidence: [expect.objectContaining({ path: "apps/web/components.json" })] }),
      expect.objectContaining({ type: "shadcn-component", evidence: [expect.objectContaining({ path: "packages/ui/src/components/ui/button.tsx" })] }),
    ]));
    expect(database.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "database-package", details: expect.objectContaining({ packageRoot: "packages/db" }) }),
      expect.objectContaining({ type: "prisma-model", evidence: [expect.objectContaining({ path: "packages/db/prisma/schema.prisma" })] }),
      expect.objectContaining({ type: "drizzle-config", evidence: [expect.objectContaining({ path: "packages/db/drizzle.config.ts" })] }),
      expect.objectContaining({ type: "drizzle-schema", evidence: [expect.objectContaining({ path: "packages/db/src/schema.ts" })] }),
    ]));
    expect(outputs.flatMap((output) => output.findings).flatMap((finding) => finding.evidence).some((evidence) => evidence.path.includes("/generated/"))).toBe(false);

    for (const output of outputs) await expectGrounded(output.findings, inventoryPaths);
  });

  test("detects Docker, Terraform, and GitHub Actions with exact source evidence", async () => {
    const inventory = await buildRepositoryInventory(fixtureRoot);
    const inventoryPaths = new Set(inventory.files.map((file) => file.path));
    const [dockerFiles, terraformFiles, workflowFiles] = await Promise.all([
      fixtureInput(["Dockerfile"]),
      fixtureInput(["infra/main.tf"]),
      fixtureInput([".github/workflows/ci.yml"]),
    ]);
    const docker = detectDocker(dockerFiles);
    const terraform = detectTerraform(terraformFiles);
    const actions = detectGitHubActions(workflowFiles);

    expect(docker.map((finding) => finding.kind)).toEqual(expect.arrayContaining(["image", "stage", "port", "health-check"]));
    expect(terraform.map((finding) => finding.kind)).toEqual(expect.arrayContaining(["provider", "resource"]));
    expect(actions.map((finding) => finding.kind)).toEqual(expect.arrayContaining(["trigger", "job", "action", "category"]));

    await expectGrounded(docker, inventoryPaths);
    await expectGrounded(terraform, inventoryPaths);
    await expectGrounded(actions, inventoryPaths);
  });

  test("parses valid arbitrary YAML indentation and only remote action references", () => {
    const actions = detectGitHubActions([{
      path: ".github/workflows/indented.yml",
      content: "   on: [push]\n   jobs:\n       test:\n            steps:\n              - uses: actions/checkout@v4\n              - uses: ./local-action\n              - uses: docker://alpine:3\n",
    }]);
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "job", name: "test" }),
      expect.objectContaining({ kind: "action", name: "actions/checkout@v4" }),
    ]));
    expect(actions.filter(({ kind }) => kind === "action").map(({ name }) => name)).toEqual(["actions/checkout@v4"]);

    const docker = detectDocker([{
      path: "compose.yaml",
      content: " services:\n       web:\n            image: app:latest\n            depends_on:\n                  database:\n                    condition: service_healthy\n       database:\n            image: postgres:17\n",
    }]);
    expect(docker).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "service", name: "web" }),
      expect.objectContaining({ kind: "service", name: "database" }),
      expect.objectContaining({ kind: "dependency", name: "database" }),
    ]));
  });

  test("detects standard Terraform required_providers blocks", () => {
    const findings = detectTerraform([{
      path: "main.tf",
      content: "terraform {\n  required_providers {\n    aws = {\n      source = \"hashicorp/aws\"\n    }\n    random = {\n      source = \"hashicorp/random\"\n    }\n  }\n}\n",
    }]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "provider", name: "aws" }),
      expect.objectContaining({ kind: "provider", name: "random" }),
    ]));
  });

  test("ignores observability and service names that only occur in comments or docs", () => {
    const source = {
      path: "src/example.ts",
      content: "// import Stripe from 'stripe'\n// console.error('not executable')\nconst docs = 'captureException() and process.env.AWS_REGION';\n",
    };
    expect(detectObservability([source])).toEqual([]);
    expect(detectExternalServices([source, {
      path: "README.md",
      content: "Example only: AWS_REGION=us-east-1 and import OpenAI from 'openai'\n",
    }, {
      path: "example.tf",
      content: "# resource \"aws_s3_bucket\" \"example\" {}\n",
    }])).toEqual([]);
  });

  test("does not derive backend coverage from generic JavaScript inventory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repoquest-frontend-only-"));
    try {
      await fs.mkdir(path.join(root, "src"));
      await fs.writeFile(path.join(root, "package.json"), '{"name":"frontend-only"}\n');
      await fs.writeFile(path.join(root, "src", "client.ts"), "export const button = 'client';\n");
      const campaign = buildAnalysisCampaign("frontend-only", await analyzeRepository(root), []);
      expect(campaign.analysisCoverage?.find(({ area }) => area === "backend")?.status).not.toBe("found");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
