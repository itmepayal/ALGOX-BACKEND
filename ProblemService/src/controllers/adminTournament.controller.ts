import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { tournamentService } from "../services/tournament.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

function requireActor(req: AuthenticatedRequest) {
  if (!req.user?.userId) {
    throw new UnauthorizedError("Authentication required");
  }
  return {
    userId: req.user.userId,
    email: req.user.email,
  };
}

export class AdminTournamentController {
  listAll = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      requireActor(req);
      const tournaments = await tournamentService.listAllTournaments();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Admin tournaments retrieved successfully",
        data: tournaments,
      });
    } catch (e) {
      next(e);
    }
  };

  create = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const { title, slug, description, maxParticipants, startTime } =
        req.body || {};

      const tournament = await tournamentService.createTournament(
        {
          title,
          slug,
          description,
          maxParticipants,
          startTime: new Date(startTime),
        },
        actor
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Tournament created successfully",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  update = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const tournamentId = String(req.params.tournamentId);
      const { title, description, startTime } = req.body || {};

      const tournament = await tournamentService.updateTournament(
        tournamentId,
        {
          title,
          description,
          startTime: startTime ? new Date(startTime) : undefined,
        },
        actor
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament updated successfully",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  publish = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const tournamentId = String(req.params.tournamentId);
      const tournament = await tournamentService.transitionStatus(
        tournamentId,
        "PUBLISHED",
        actor
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament published",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  openRegistration = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const tournamentId = String(req.params.tournamentId);
      const tournament = await tournamentService.transitionStatus(
        tournamentId,
        "REGISTRATION_OPEN",
        actor
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Registration opened for tournament",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  closeRegistration = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const tournamentId = String(req.params.tournamentId);
      const tournament = await tournamentService.transitionStatus(
        tournamentId,
        "REGISTRATION_CLOSED",
        actor
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Registration closed for tournament",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  seed = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const tournamentId = String(req.params.tournamentId);
      const tournament = await tournamentService.seedAndGenerateBracket(
        tournamentId,
        actor
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament seeded and bracket generated successfully",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  start = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const tournamentId = String(req.params.tournamentId);
      const tournament = await tournamentService.startTournament(
        tournamentId,
        actor
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament started",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  archive = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const actor = requireActor(req);
      const tournamentId = String(req.params.tournamentId);
      const tournament = await tournamentService.transitionStatus(
        tournamentId,
        "ARCHIVED",
        actor
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament archived",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const adminTournamentController = new AdminTournamentController();
