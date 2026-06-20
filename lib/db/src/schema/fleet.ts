import { pgTable, serial, text, integer, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  photoUrl: text("photo_url"),
  vehicleNumber: text("vehicle_number").notNull(),
  isActive: boolean("is_active").notNull().default(false),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  plateNumber: text("plate_number").notNull(),
  model: text("model").notNull(),
  capacity: integer("capacity").notNull().default(40),
  isActive: boolean("is_active").notNull().default(false),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;

export const stationsTable = pgTable("stations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
});

export const insertStationSchema = createInsertSchema(stationsTable).omit({ id: true });
export type InsertStation = z.infer<typeof insertStationSchema>;
export type Station = typeof stationsTable.$inferSelect;
