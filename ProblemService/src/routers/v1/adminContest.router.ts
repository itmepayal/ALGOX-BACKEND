import express from "express";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { adminContestController } from "../../controllers/adminContest.controller";

const adminContestRouter = express.Router();

adminContestRouter.use(authenticateJwt);

adminContestRouter.get(
  "/",
  requirePermission("contests:manage", "contests:create"),
  adminContestController.list
);
adminContestRouter.post(
  "/",
  requirePermission("contests:create"),
  adminContestController.create
);

adminContestRouter.get(
  "/:contestId",
  requirePermission("contests:manage", "contests:create"),
  adminContestController.get
);
adminContestRouter.patch(
  "/:contestId",
  requirePermission("contests:manage"),
  adminContestController.update
);
adminContestRouter.delete(
  "/:contestId",
  requirePermission("contests:manage"),
  adminContestController.remove
);

adminContestRouter.post(
  "/:contestId/publish",
  requirePermission("contests:manage"),
  adminContestController.publish
);
adminContestRouter.post(
  "/:contestId/schedule",
  requirePermission("contests:manage"),
  adminContestController.schedule
);
adminContestRouter.post(
  "/:contestId/start",
  requirePermission("contests:manage"),
  adminContestController.start
);
adminContestRouter.post(
  "/:contestId/end",
  requirePermission("contests:manage"),
  adminContestController.end
);
adminContestRouter.post(
  "/:contestId/archive",
  requirePermission("contests:manage"),
  adminContestController.archive
);

adminContestRouter.post(
  "/:contestId/problems",
  requirePermission("contests:manage"),
  adminContestController.addProblem
);
adminContestRouter.delete(
  "/:contestId/problems/:problemId",
  requirePermission("contests:manage"),
  adminContestController.removeProblem
);

adminContestRouter.get(
  "/:contestId/participants",
  requirePermission("contests:manage", "contests:create"),
  adminContestController.listParticipants
);
adminContestRouter.get(
  "/:contestId/leaderboard",
  requirePermission("contests:manage", "contests:create"),
  adminContestController.leaderboard
);

export default adminContestRouter;
