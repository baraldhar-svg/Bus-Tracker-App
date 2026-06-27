import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
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
  calendarSystem: text("calendar_system").notNull().default("bs"),
  subscriptionTier: text("subscription_tier").notNull().default("gold"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;

// Admin registration applications — pending SuperAdmin approval
export const adminRegistrationsTable = pgTable("admin_registrations", {
  id: serial("id").primaryKey(),
  schoolName: text("school_name").notNull(),
  contactName: text("contact_name").notNull(),
  landline: text("landline").notNull(),
  email: text("email").notNull(),
  adminName: text("admin_name").notNull(),
  position: text("position").notNull(),
  mobile: text("mobile").notNull(),
  // pending_super_admin_approval | approved | verified_active | rejected
  status: text("status").notNull().default("pending_super_admin_approval"),
  schoolCode: text("school_code"),
  tenantId: integer("tenant_id"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminRegistrationSchema = createInsertSchema(adminRegistrationsTable, {
  email: z.email(),
}).pick({
  schoolName: true,
  contactName: true,
  landline: true,
  email: true,
  adminName: true,
  position: true,
  mobile: true,
});
export type InsertAdminRegistration = z.infer<typeof insertAdminRegistrationSchema>;
export type AdminRegistration = typeof adminRegistrationsTable.$inferSelect;

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
