import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

export const advertisementsTable = pgTable("advertisements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url").notNull(),
  targetUrl: text("target_url"),
  tenantId: integer("tenant_id"),
  sortOrder: integer("sort_order").default(0).notNull(),
  active: integer("active").default(1).notNull(),
});

export type Advertisement = typeof advertisementsTable.$inferSelect;
