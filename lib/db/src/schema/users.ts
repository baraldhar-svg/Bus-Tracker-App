import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull(),
  title: text("title"),
  photoUrl: text("photo_url"),
  role: text("role").notNull().default("student"),
  schoolCode: text("school_code"),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;

export const otpCodesTable = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: integer("used").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
