import express from "express";
import {
  authenticateJwt,
  optionalAuthenticateJwt,
} from "../../middlewares/auth.middleware";
import { requireFeature } from "../../middlewares/requireFeature.middleware";
import { tournamentController } from "../../controllers/tournament.controller";

export const tournamentRouter = express.Router();
const requireTournaments = requireFeature("premium.battles");

tournamentRouter.get(
  "/",
  optionalAuthenticateJwt,
  requireTournaments,
  tournamentController.listPublic
);

tournamentRouter.get(
  "/me/summary",
  authenticateJwt,
  requireTournaments,
  tournamentController.getMySummary
);

tournamentRouter.get(
  "/:slug",
  optionalAuthenticateJwt,
  requireTournaments,
  tournamentController.getBySlug
);

tournamentRouter.get(
  "/:slug/bracket",
  optionalAuthenticateJwt,
  requireTournaments,
  tournamentController.getBracket
);

tournamentRouter.get(
  "/:slug/results",
  optionalAuthenticateJwt,
  requireTournaments,
  tournamentController.getResults
);

tournamentRouter.post(
  "/:slug/register",
  authenticateJwt,
  requireTournaments,
  tournamentController.register
);

tournamentRouter.post(
  "/matches/:matchId/start-battle",
  authenticateJwt,
  requireTournaments,
  tournamentController.startMatchBattle
);

export default tournamentRouter;
