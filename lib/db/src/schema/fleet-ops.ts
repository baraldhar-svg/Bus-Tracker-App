import { pgTable, serial, text, integer, real, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { vehiclesTable } from "./fleet";

export const fuelLogsTable = pgTable("fuel_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id),
  date: text("date").notNull(),
  liters: real("liters").notNull(),
  amountNpr: integer("amount_npr").notNull(),
  odometerKm: integer("odometer_km").notNull(),
  receiptUrl: text("receipt_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FuelLog = typeof fuelLogsTable.$inferSelect;

export const maintenanceRecordsTable = pgTable("maintenance_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id),
  partType: text("part_type").notNull(),
  description: text("description"),
  costNpr: integer("cost_npr").notNull().default(0),
  odometerKm: integer("odometer_km").notNull(),
  serviceDate: text("service_date").notNull(),
  vendor: text("vendor"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceRecord = typeof maintenanceRecordsTable.$inferSelect;

export const vehicleDocumentsTable = pgTable("vehicle_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehiclesTable.id),
  bluebookExpiry: text("bluebook_expiry"),
  insuranceExpiry: text("insurance_expiry"),
  pollutionExpiry: text("pollution_expiry"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique("vehicle_documents_vehicle_unique").on(t.vehicleId)]);

export type VehicleDocument = typeof vehicleDocumentsTable.$inferSelect;
