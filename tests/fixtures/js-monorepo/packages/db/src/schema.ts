import { integer, pgTable } from "drizzle-orm/pg-core";

export const quests = pgTable("quests", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
});
