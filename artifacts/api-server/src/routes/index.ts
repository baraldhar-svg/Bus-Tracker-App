import { Router, type IRouter } from "express";
import cors from "cors"; // पहिचान गरिसकिएको छ
import healthRouter from "./health";
import tenantsRouter from "./tenants";
import announcementsRouter from "./announcements";
import stationsRouter from "./stations";
import driversRouter from "./drivers";
import vehiclesRouter from "./vehicles";
import fleetRouter from "./fleet";
import passengersRouter from "./passengers";
import tripsRouter from "./trips";
import subscriptionsRouter from "./subscriptions";
import dashboardRouter from "./dashboard";
import authRouter from "./auth";
import advertisementsRouter from "./advertisements";
import routesRouter from "./routes";
import geocodeRouter from "./geocode";
import calendarRouter from "./calendar";
import webauthnRouter from "./webauthn";
import usersRouter from "./users";
import whatsappRouter from "./whatsapp";
import eventsRouter from "./events";
import superadminRouter from "./superadmin";
import fuelLogsRouter from "./fuel-logs";
import maintenanceRouter from "./maintenance-records";
import vehicleDocumentsRouter from "./vehicle-documents";

const router: IRouter = Router();

// 🚀 यहाँ निर CORS थपिएको छ ताकि भर्सलले यो राउटर भित्रका सबै लिङ्कहरू एक्सेस गर्न पाओस्
router.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

router.use(healthRouter);
router.use("/auth/webauthn", webauthnRouter);
router.use("/auth", authRouter);
router.use("/advertisements", advertisementsRouter);
router.use("/tenants", tenantsRouter);
router.use("/announcements", announcementsRouter);
router.use("/stations", stationsRouter);
router.use("/drivers", driversRouter);
router.use("/vehicles", vehiclesRouter);
router.use("/fleet", fleetRouter);
router.use("/passengers", passengersRouter);
router.use("/trips", tripsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/routes", routesRouter);
router.use("/geocode", geocodeRouter);
router.use("/calendar-events", calendarRouter);
router.use("/users", usersRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/events", eventsRouter);
router.use("/superadmin", superadminRouter);
router.use("/fuel-logs", fuelLogsRouter);
router.use("/maintenance-records", maintenanceRouter);
router.use("/vehicle-documents", vehicleDocumentsRouter);

export default router;
