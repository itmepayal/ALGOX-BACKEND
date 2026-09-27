import { Router } from "express";
import { battleController } from "../../controllers/battle.controller";
import { matchmakingController } from "../../controllers/matchmaking.controller";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { requireFeature } from "../../middlewares/requireFeature.middleware";

export const battleRouter = Router();
const requireBattles = requireFeature("premium.battles");

// Student search, Stats, My battles & Competitive Rating
battleRouter.get("/search-students", authenticateJwt, requireBattles, battleController.searchStudents);
battleRouter.get("/stats", authenticateJwt, requireBattles, battleController.getBattleStats);
battleRouter.get("/my", authenticateJwt, requireBattles, battleController.getMyBattles);
battleRouter.get("/rating/me", authenticateJwt, requireBattles, battleController.getRatingStats);
battleRouter.get("/rating/history", authenticateJwt, requireBattles, battleController.getRatingHistory);
battleRouter.get("/leaderboard", authenticateJwt, requireBattles, battleController.getLeaderboard);
battleRouter.get("/leaderboard/me", authenticateJwt, requireBattles, battleController.getMyRank);

// Quick Matchmaking V1 routes
battleRouter.post("/matchmaking/join", authenticateJwt, requireBattles, matchmakingController.joinQueue);
battleRouter.post("/matchmaking/cancel", authenticateJwt, requireBattles, matchmakingController.cancelQueue);
battleRouter.get("/matchmaking/status", authenticateJwt, requireBattles, matchmakingController.getStatus);

// Challenge lifecycle
battleRouter.post("/", authenticateJwt, requireBattles, battleController.createChallenge);
battleRouter.get("/:id", authenticateJwt, requireBattles, battleController.getBattleById);
battleRouter.post("/:id/accept", authenticateJwt, requireBattles, battleController.acceptChallenge);
battleRouter.post("/:id/decline", authenticateJwt, requireBattles, battleController.declineChallenge);
battleRouter.post("/:id/cancel", authenticateJwt, requireBattles, battleController.cancelChallenge);

// Lobby & Battle execution
battleRouter.post("/:id/join", authenticateJwt, requireBattles, battleController.joinLobby);
battleRouter.post("/:id/ready", authenticateJwt, requireBattles, battleController.setReady);
battleRouter.get("/:id/problems", authenticateJwt, requireBattles, battleController.getBattleProblems);
battleRouter.get("/:id/result", authenticateJwt, requireBattles, battleController.getBattleResult);
battleRouter.post("/:id/forfeit", authenticateJwt, requireBattles, battleController.forfeitBattle);

export function mountBattleInternal(r: Router): void {
  r.post("/internal/battles/:battleId/record-submission", battleController.recordSubmission);
}

export default battleRouter;
