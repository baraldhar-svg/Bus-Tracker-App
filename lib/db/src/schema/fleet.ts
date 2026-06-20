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
  tag: text("tag"),
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
  radius: integer("radius").notNull().default(200),
});

export const insertStationSchema = createInsertSchema(stationsTable).omit({ id: true });
export type InsertStation = z.infer<typeof insertStationSchema>;
export type Station = typeof stationsTable.$inferSelect;

export const routesTable = pgTable("routes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  driverId: integer("driver_id").references(() => driversTable.id),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertRouteSchema = createInsertSchema(routesTable).omit({ id: true });
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routesTable.$inferSelect;

export const routeStationsTable = pgTable("route_stations", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => routesTable.id, { onDelete: "cascade" }),
  stationId: integer("station_id").notNull().references(() => stationsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
});

export const insertRouteStationSchema = createInsertSchema(routeStationsTable).omit({ id: true });
export type InsertRouteStation = z.infer<typeof insertRouteStationSchema>;
export type RouteStation = typeof routeStationsTable.$inferSelect;
