import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
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
  biometricEnabled: boolean("biometric_enabled").default(false).notNull(),
  biometricCredentialId: text("biometric_credential_id"),
  biometricPublicKey: text("biometric_public_key"),
  biometricCounter: integer("biometric_counter").default(0),
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

export const webauthnChallengesTable = pgTable("webauthn_challenges", {
  id: serial("id").primaryKey(),
  challenge: text("challenge").notNull().unique(),
  userId: integer("user_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
