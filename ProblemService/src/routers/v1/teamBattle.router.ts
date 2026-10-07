import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { teamBattleController } from "../../controllers/teamBattle.controller";

const teamBattleRouter = express.Router();

teamBattleRouter.use(authenticateJwt);

teamBattleRouter.get("/leaderboard", teamBattleController.getLeaderboard.bind(teamBattleController));
teamBattleRouter.post("/", teamBattleController.challengeTeam.bind(teamBattleController));
teamBattleRouter.get("/:id", teamBattleController.getBattleById.bind(teamBattleController));
teamBattleRouter.post("/:id/accept", teamBattleController.acceptBattle.bind(teamBattleController));
teamBattleRouter.post("/:id/participants", teamBattleController.selectParticipants.bind(teamBattleController));
teamBattleRouter.post("/:id/start", teamBattleController.startBattle.bind(teamBattleController));
teamBattleRouter.post("/:id/cancel", teamBattleController.cancelBattle.bind(teamBattleController));
teamBattleRouter.post("/:id/submissions", teamBattleController.recordSubmission.bind(teamBattleController));

export default teamBattleRouter;
