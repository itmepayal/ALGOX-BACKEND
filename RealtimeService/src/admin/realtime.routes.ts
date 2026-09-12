import { Router } from "express";
import {
  authenticateJwt,
  requirePermission,
} from "../middlewares/auth.middleware";
import { realtimeAdminController } from "./realtime.controller";

/**
 * Admin realtime ops API
 * Base: /api/v1/admin/realtime
 */
const realtimeAdminRouter = Router();

realtimeAdminRouter.use(authenticateJwt);

realtimeAdminRouter.get(
  "/overview",
  requirePermission("realtime:view", "realtime:analytics", "health:view"),
  realtimeAdminController.overview.bind(realtimeAdminController)
);

realtimeAdminRouter.get(
  "/users",
  requirePermission("realtime:view", "realtime:connections"),
  realtimeAdminController.users.bind(realtimeAdminController)
);

realtimeAdminRouter.get(
  "/connections",
  requirePermission("realtime:connections", "realtime:view"),
  realtimeAdminController.connections.bind(realtimeAdminController)
);

realtimeAdminRouter.get(
  "/rooms",
  requirePermission("realtime:rooms", "realtime:view"),
  realtimeAdminController.rooms.bind(realtimeAdminController)
);

realtimeAdminRouter.get(
  "/events",
  requirePermission("realtime:events", "realtime:view"),
  realtimeAdminController.events.bind(realtimeAdminController)
);

realtimeAdminRouter.get(
  "/analytics",
  requirePermission("realtime:analytics", "realtime:view"),
  realtimeAdminController.analytics.bind(realtimeAdminController)
);

realtimeAdminRouter.post(
  "/broadcast",
  requirePermission("realtime:broadcast"),
  realtimeAdminController.broadcast.bind(realtimeAdminController)
);

realtimeAdminRouter.post(
  "/connections/:id/disconnect",
  requirePermission("realtime:disconnect"),
  realtimeAdminController.disconnect.bind(realtimeAdminController)
);

export default realtimeAdminRouter;
