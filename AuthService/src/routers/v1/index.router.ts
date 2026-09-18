import express from "express";
import authRouter from "./auth.router";
import adminRouter from "./admin.router";
import { sendResponse } from "../../utils/helpers/response.helper";
import { HTTP_STATUS } from "../../utils/constants";
import { blockWhenMaintenance } from "../../middlewares/featureFlag.middleware";
import { requireInternalSecret } from "../../middlewares/auth.middleware";
import { adminUserController } from "../../controllers/adminUser.controller";

const v1Router = express.Router();

// Health check endpoint for load balancers and container orchestrators
v1Router.get("/health", (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: "AuthService is healthy",
  });
});

// Centralized maintenance gate (exempts health/admin/login/public settings)
v1Router.use(blockWhenMaintenance);

v1Router.use("/auth", authRouter);

/**
 * Analytics KPI fan-in — service-to-service only.
 * Mounted outside adminRouter so authenticateJwt is not required.
 * AuthZ for admin UI remains on AnalyticsService `/admin/overview` (JWT + analytics:view).
 */
v1Router.get(
  "/auth/admin/internal/user-stats",
  requireInternalSecret,
  adminUserController.internalStats.bind(adminUserController)
);

v1Router.use("/auth/admin", adminRouter);

export default v1Router;
