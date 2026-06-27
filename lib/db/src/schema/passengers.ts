import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { stationsTable, routesTable } from "./fleet";

export const passengersTable = pgTable("passengers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  phone: text("phone"),
  photoUrl: text("photo_url"),
  role: text("role").notNull().default("student"),
  status: text("status").notNull().default("pending"),
  stationId: integer("station_id").notNull().references(() => stationsTable.id),
  routeId: integer("route_id").references(() => routesTable.id),
  boardedAt: timestamp("boarded_at"),
  liveToday: integer("live_today").notNull().default(0),
  quickMessage: text("quick_message"),
  className: text("class_name"),
  customClass: text("custom_class"),
  section: text("section"),
  rollNumber: text("roll_number"),
  faculty: text("faculty"),
  designation: text("designation"),
  routeSubscribedAt: timestamp("route_subscribed_at"),
});

export const insertPassengerSchema = createInsertSchema(passengersTable).omit({ id: true, boardedAt: true });
export type InsertPassenger = z.infer<typeof insertPassengerSchema>;
export type Passenger = typeof passengersTable.$inferSelect;

// Boarding audit log — one row per board/absent/unboard action
export const boardingLogsTable = pgTable("boarding_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  passengerId: integer("passenger_id").notNull(),
  passengerName: text("passenger_name").notNull(),
  stationId: integer("station_id").notNull(),
  stationName: text("station_name").notNull(),
  driverId: integer("driver_id"),
  driverName: text("driver_name"),
  action: text("action").notNull(), // "boarded" | "absent" | "unboarded"
  actionAt: timestamp("action_at").defaultNow().notNull(),
});

export type BoardingLog = typeof boardingLogsTable.$inferSelect;

// Driver "waiting" notifications — driver pings a student at the upcoming station
export const driverNotificationsTable = pgTable("driver_notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  passengerId: integer("passenger_id").notNull(),
  passengerName: text("passenger_name").notNull(),
  stationId: integer("station_id").notNull(),
  stationName: text("station_name").notNull(),
  driverId: integer("driver_id"),
  driverName: text("driver_name"),
  message: text("message").notNull().default("Driver is waiting for you. Please come to the station."),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  tripDate: text("trip_date").notNull(), // YYYY-MM-DD, used for per-day dedup
});

export type DriverNotification = typeof driverNotificationsTable.$inferSelect;

// WhatsApp alert log — one row per outbound message attempt
export const whatsappNotificationsTable = pgTable("whatsapp_notifications", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  to: text("to").notNull(),
  recipientName: text("recipient_name").notNull(),
  type: text("type").notNull(), // "absent" | "delay"
  passengerName: text("passenger_name"),
  stationName: text("station_name"),
  messageBody: text("message_body").notNull(),
  status: text("status").notNull().default("sent"), // "sent" | "failed"
  errorDetail: text("error_detail"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WhatsappNotification = typeof whatsappNotificationsTable.$inferSelect;
