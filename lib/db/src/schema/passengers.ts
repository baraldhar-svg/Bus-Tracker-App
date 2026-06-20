import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { stationsTable, routesTable } from "./fleet";

export const passengersTable = pgTable("passengers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  role: text("role").notNull().default("student"),
  status: text("status").notNull().default("pending"),
  stationId: integer("station_id").notNull().references(() => stationsTable.id),
  routeId: integer("route_id").references(() => routesTable.id),
  boardedAt: timestamp("boarded_at"),
  liveToday: integer("live_today").notNull().default(0),
  quickMessage: text("quick_message"),
});

export const insertPassengerSchema = createInsertSchema(passengersTable).omit({ id: true, boardedAt: true });
export type InsertPassenger = z.infer<typeof insertPassengerSchema>;
export type Passenger = typeof passengersTable.$inferSelect;
