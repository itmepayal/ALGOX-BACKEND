import { Router } from "express";
import { LeaderboardController } from "../../controllers/leaderboard.controller";
import { LeaderboardService } from "../../services/leaderboard.service";
import { LeaderboardRepository } from "../../repositories/leaderboard.repository";

const leaderboardRouter = Router();
const leaderboardRepository = new LeaderboardRepository();
const leaderboardService = new LeaderboardService(leaderboardRepository);
const leaderboardController = new LeaderboardController(leaderboardService);

leaderboardRouter.get("/", leaderboardController.getGlobalLeaderboard.bind(leaderboardController));
leaderboardRouter.get("/user/:userId", leaderboardController.getUserStats.bind(leaderboardController));
leaderboardRouter.post("/record-solved", leaderboardController.recordSolvedProblem.bind(leaderboardController));

export default leaderboardRouter;
