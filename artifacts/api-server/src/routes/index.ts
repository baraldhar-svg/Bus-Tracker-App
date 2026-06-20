import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(healthRouter);
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

export default router;
