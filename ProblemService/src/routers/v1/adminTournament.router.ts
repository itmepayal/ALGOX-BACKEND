import express from "express";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { adminTournamentController } from "../../controllers/adminTournament.controller";

export const adminTournamentRouter = express.Router();

adminTournamentRouter.use(authenticateJwt);

adminTournamentRouter.get(
  "/",
  requirePermission("contests:manage"),
  adminTournamentController.listAll
);

adminTournamentRouter.post(
  "/",
  requirePermission("contests:create"),
  adminTournamentController.create
);

adminTournamentRouter.patch(
  "/:tournamentId",
  requirePermission("contests:manage"),
  adminTournamentController.update
);

adminTournamentRouter.post(
  "/:tournamentId/publish",
  requirePermission("contests:manage"),
  adminTournamentController.publish
);

adminTournamentRouter.post(
  "/:tournamentId/open-registration",
  requirePermission("contests:manage"),
  adminTournamentController.openRegistration
);

adminTournamentRouter.post(
  "/:tournamentId/close-registration",
  requirePermission("contests:manage"),
  adminTournamentController.closeRegistration
);

adminTournamentRouter.post(
  "/:tournamentId/seed",
  requirePermission("contests:manage"),
  adminTournamentController.seed
);

adminTournamentRouter.post(
  "/:tournamentId/start",
  requirePermission("contests:manage"),
  adminTournamentController.start
);

adminTournamentRouter.post(
  "/:tournamentId/archive",
  requirePermission("contests:manage"),
  adminTournamentController.archive
);

export default adminTournamentRouter;
