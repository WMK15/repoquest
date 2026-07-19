import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEMO_REPO_ROOT } from "./paths";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_CHARS = 20_000;
const TEST_TIMEOUT_MS = 90_000;

export interface TestRunResult {
  success: boolean;
  command: string;
  output: string;
  summary: string;
}

function stripAnsi(text: string): string {
  return text.replace(/\[[0-9;]*m/g, "");
}

function summarise(output: string): string {
  const line = output
    .split("\n")
    .find((l) => l.trim().startsWith("Tests"));
  return line?.trim() ?? "Test run finished.";
}

/** Run the PulseBoard test suite with a fixed, allowlisted command. */
export async function runDemoRepoTests(): Promise<TestRunResult> {
  const command = "npm test";
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["test"], {
      cwd: DEMO_REPO_ROOT,
      timeout: TEST_TIMEOUT_MS,
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
      maxBuffer: 4 * 1024 * 1024,
    });
    const output = stripAnsi(`${stdout}\n${stderr}`).slice(-MAX_OUTPUT_CHARS);
    return { success: true, command, output, summary: summarise(output) };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    const output = stripAnsi(
      `${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim() || err.message
    ).slice(-MAX_OUTPUT_CHARS);
    return { success: false, command, output, summary: summarise(output) };
  }
}
