import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { RepoQuestModeSchema } from "../domain/schemas";

const RuntimeDescriptorSchema = z.object({
  repositoryId: z.string().min(1),
  mode: RepoQuestModeSchema,
  repositoryName: z.string().min(1),
  repositoryRoot: z.string().min(1).optional(),
  updatedAt: z.string().datetime(),
});

export type RuntimeDescriptor = z.infer<typeof RuntimeDescriptorSchema>;

const registryRoot = path.resolve(process.cwd(), ".repoquest");
const registryPath = path.join(registryRoot, "runtimes.json");
let writes = Promise.resolve();

async function readRegistry(): Promise<RuntimeDescriptor[]> {
  try {
    return z.array(RuntimeDescriptorSchema).parse(JSON.parse(await fs.readFile(registryPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    const quarantined = `${registryPath}.corrupt-${Date.now()}`;
    await fs.rename(registryPath, quarantined).catch(() => {});
    console.warn(`RepoQuest runtime registry recovered corrupt data at ${quarantined}`);
    return [];
  }
}

async function writeRegistry(descriptors: RuntimeDescriptor[]) {
  await fs.mkdir(registryRoot, { recursive: true, mode: 0o700 });
  const temporary = `${registryPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(descriptors, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporary, registryPath);
}

export async function registerRuntime(descriptor: Omit<RuntimeDescriptor, "updatedAt">) {
  const validated = RuntimeDescriptorSchema.parse({
    ...descriptor,
    updatedAt: new Date().toISOString(),
  });
  const previous = writes;
  let release = () => {};
  writes = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const descriptors = await readRegistry();
    await writeRegistry([
      ...descriptors.filter((item) => item.repositoryId !== validated.repositoryId),
      validated,
    ]);
    return validated;
  } finally {
    release();
  }
}

export async function getRegisteredRuntime(repositoryId: string) {
  return (await readRegistry()).find((descriptor) => descriptor.repositoryId === repositoryId) ?? null;
}
