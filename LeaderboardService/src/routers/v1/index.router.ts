import express from "express";
import leaderboardRouter from "./leaderboard.router";
import { sendResponse } from "../../utils/helpers/response.helper";
import { HTTP_STATUS, LEADERBOARD_MESSAGES } from "../../utils/constants";
import { blockWhenMaintenance } from "../../middlewares/featureFlag.middleware";
import { requireInternalSecret } from "../../middlewares/internalAuth.middleware";
import { invalidateFeatureFlagsCache } from "../../utils/featureFlags";

const v1Router = express.Router();

v1Router.get("/health", (req, res) => {
  sendResponse({
    res,
    statusCode: HTTP_STATUS.OK,
    message: LEADERBOARD_MESSAGES.SERVICE_HEALTHY,
  });
});


v1Router.post(
  "/internal/feature-flags/invalidate",
  requireInternalSecret,
  (_req, res) => {
    invalidateFeatureFlagsCache();
    res.status(200).json({ success: true });
  }
);

v1Router.use(blockWhenMaintenance);

v1Router.use("/leaderboard", leaderboardRouter);

export default v1Router;
