declare module "@fixture/ui" {
  export function Button(props: { children: React.ReactNode }): React.ReactElement;
}

declare module "drizzle-orm/pg-core" {
  interface IntegerBuilder {
    primaryKey(): IntegerBuilder;
    generatedAlwaysAsIdentity(): IntegerBuilder;
  }

  export function integer(): IntegerBuilder;
  export function pgTable(name: string, columns: Record<string, IntegerBuilder>): unknown;
}
