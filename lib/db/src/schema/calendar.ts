import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const calendarEventsTable = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("event"),
  eventDate: text("event_date").notNull(),
  notified: boolean("notified").notNull().default(false),
  autoNotify: boolean("auto_notify").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
