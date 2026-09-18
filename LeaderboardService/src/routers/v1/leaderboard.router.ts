import { Router } from "express";
import { LeaderboardController } from "../../controllers/leaderboard.controller";
import { LeaderboardService } from "../../services/leaderboard.service";
import { LeaderboardRepository } from "../../repositories/leaderboard.repository";
import { requireInternalSecret } from "../../middlewares/internalAuth.middleware";
import {
  authenticateJwt,
  requireLeaderboardAdmin,
} from "../../middlewares/auth.middleware";

const leaderboardRouter = Router();
const leaderboardRepository = new LeaderboardRepository();
const leaderboardService = new LeaderboardService(leaderboardRepository);
const leaderboardController = new LeaderboardController(leaderboardService);

leaderboardRouter.get(
  "/",
  leaderboardController.getGlobalLeaderboard.bind(leaderboardController)
);
leaderboardRouter.get(
  "/user/:userId",
  leaderboardController.getUserStats.bind(leaderboardController)
);
leaderboardRouter.post(
  "/record-solved",
  requireInternalSecret,
  leaderboardController.recordSolvedProblem.bind(leaderboardController)
);
leaderboardRouter.post(
  "/internal/contest-rating",
  requireInternalSecret,
  leaderboardController.applyContestRatings.bind(leaderboardController)
);

leaderboardRouter.post(
  "/admin/rebuild",
  authenticateJwt,
  requireLeaderboardAdmin,
  leaderboardController.rebuild.bind(leaderboardController)
);
leaderboardRouter.post(
  "/admin/reset-user/:userId",
  authenticateJwt,
  requireLeaderboardAdmin,
  leaderboardController.resetUser.bind(leaderboardController)
);
leaderboardRouter.post(
  "/admin/suspend-entry/:userId",
  authenticateJwt,
  requireLeaderboardAdmin,
  leaderboardController.suspendEntry.bind(leaderboardController)
);
leaderboardRouter.get(
  "/admin/audit",
  authenticateJwt,
  requireLeaderboardAdmin,
  leaderboardController.listAudit.bind(leaderboardController)
);

export default leaderboardRouter;
