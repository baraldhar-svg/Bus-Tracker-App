import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  address: text("address"),
  contactPhone: text("contact_phone"),
  schoolCode: text("school_code"),
  currency: text("currency").notNull().default("NPR"),
  country: text("country").notNull().default("NP"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  message: text("message").notNull(),
  messageNe: text("message_ne"),
  severity: text("severity").notNull().default("info"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ id: true, createdAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;
