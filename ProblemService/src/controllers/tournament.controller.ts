import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { tournamentService } from "../services/tournament.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user?.userId) {
    throw new UnauthorizedError("Authentication required");
  }
  const email = req.user.email || "";
  const name = email ? email.split("@")[0] : "Player";
  return {
    id: req.user.userId,
    name,
    email,
  };
}

export class TournamentController {
  listPublic = async (
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const tournaments = await tournamentService.listPublicTournaments();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Public tournaments retrieved",
        data: tournaments,
      });
    } catch (e) {
      next(e);
    }
  };

  getBySlug = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const slug = String(req.params.slug);
      const viewerUserId = req.user?.userId;
      const tournament = await tournamentService.getPublicBySlug(
        slug,
        viewerUserId
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament details retrieved",
        data: tournament,
      });
    } catch (e) {
      next(e);
    }
  };

  register = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const slug = String(req.params.slug);
      const participant = await tournamentService.register(slug, user);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Successfully registered for tournament",
        data: participant,
      });
    } catch (e) {
      next(e);
    }
  };

  getBracket = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const slug = String(req.params.slug);
      const bracket = await tournamentService.getBracket(slug);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament bracket retrieved",
        data: bracket,
      });
    } catch (e) {
      next(e);
    }
  };

  getResults = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const slug = String(req.params.slug);
      const results = await tournamentService.getResults(slug);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament results retrieved",
        data: results,
      });
    } catch (e) {
      next(e);
    }
  };

  getMySummary = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const summary = await tournamentService.getMyTournamentSummary(user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "My tournament summary retrieved",
        data: summary,
      });
    } catch (e) {
      next(e);
    }
  };

  startMatchBattle = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const matchId = String(req.params.matchId);
      const result = await tournamentService.startMatchBattle(matchId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Tournament match battle initialized",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const tournamentController = new TournamentController();
