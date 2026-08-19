import { dependencyEntries, evidenceAt, keyEvidence, packageManifests, parseJson, readText, repositoryFiles } from "./ecosystems/helpers";
import type { DetectorFinding, DetectorOutput } from "./ecosystems/types";

interface ComponentsJson {
  $schema?: string;
  style?: string;
  rsc?: boolean;
  tsx?: boolean;
  tailwind?: { config?: string; css?: string; baseColor?: string; cssVariables?: boolean; prefix?: string };
  aliases?: Record<string, string>;
  registries?: Record<string, string>;
}

/** Detect Tailwind v3/v4 setup and shadcn configuration/components. */
export async function detectTailwindShadcn(root: string): Promise<DetectorOutput> {
  const findings: DetectorFinding[] = [];
  for (const manifest of await packageManifests(root)) {
    for (const [name, version, section] of dependencyEntries(manifest.pkg)) {
      if (name !== "tailwindcss" && name !== "@tailwindcss/postcss" && name !== "@tailwindcss/vite" && name !== "@tailwindcss/cli") continue;
      findings.push({ type: "tailwind-package", label: `${name} ${version}`, evidence: [keyEvidence(manifest.file, manifest.text, name)], details: { name, version, section, major: version.match(/\d+/)?.[0], packageRoot: manifest.directory } });
    }
  }

  for (const file of await repositoryFiles(root, ["tailwind.config.{js,cjs,mjs,ts,cts,mts}", "**/tailwind.config.{js,cjs,mjs,ts,cts,mts}"])) {
    const text = readText(root, file);
    if (text !== undefined) findings.push({ type: "tailwind-config", label: file, evidence: [evidenceAt(file, text)], details: { generation: "v3-compatible" } });
  }

  const stylesheets = await repositoryFiles(root, ["**/*.{css,pcss,postcss}"]);
  const directives: Array<[RegExp, string, string]> = [
    [/@import\s+["']tailwindcss["']/, "tailwind-v4-entry", "Tailwind v4 CSS import"],
    [/@theme\b/, "tailwind-v4-theme", "Tailwind v4 theme"],
    [/@source\b/, "tailwind-v4-source", "Tailwind v4 source"],
    [/@plugin\b/, "tailwind-v4-plugin", "Tailwind v4 plugin"],
    [/@config\b/, "tailwind-css-config", "Tailwind CSS config reference"],
    [/@tailwind\s+(?:base|components|utilities)\b/, "tailwind-directive", "Tailwind layer directive"],
  ];
  for (const file of stylesheets) {
    const text = readText(root, file);
    if (text === undefined) continue;
    for (const [pattern, type, label] of directives) {
      const match = pattern.exec(text);
      if (match) findings.push({ type, label, evidence: [evidenceAt(file, text, match.index)], details: { file } });
    }
  }

  for (const file of await repositoryFiles(root, ["components.json", "**/components.json"])) {
    const text = readText(root, file);
    const config = text ? parseJson<ComponentsJson>(text, file) : undefined;
    if (!text || !config) continue;
    findings.push({
      type: "shadcn-config",
      label: `shadcn${config.style ? ` (${config.style})` : ""}`,
      evidence: [evidenceAt(file, text)],
      details: {
        style: config.style,
        rsc: config.rsc,
        tsx: config.tsx,
        tailwind: config.tailwind,
        aliases: config.aliases,
        registries: config.registries,
      },
    });
    for (const [alias, target] of Object.entries(config.aliases ?? {})) {
      findings.push({ type: "shadcn-alias", label: `${alias} -> ${target}`, evidence: [keyEvidence(file, text, alias)], details: { alias, target } });
    }
  }

  const components = await repositoryFiles(root, [
    "components/ui/**/*.{js,jsx,ts,tsx}",
    "src/components/ui/**/*.{js,jsx,ts,tsx}",
    "app/components/ui/**/*.{js,jsx,ts,tsx}",
    "**/components/ui/**/*.{js,jsx,ts,tsx}",
    "**/src/components/ui/**/*.{js,jsx,ts,tsx}",
    "**/app/components/ui/**/*.{js,jsx,ts,tsx}",
  ]);
  for (const file of components) {
    const text = readText(root, file);
    if (text === undefined) continue;
    findings.push({ type: "shadcn-component", label: file, evidence: [evidenceAt(file, text)], details: { file } });
  }

  return { detector: "tailwind-shadcn", findings };
}
