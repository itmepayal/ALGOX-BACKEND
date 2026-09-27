import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { teamService } from "../services/team.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError, BadRequestError } from "../utils/errors/app.error";

function requireUserId(req: AuthenticatedRequest): string {
  const id = req.user?.userId;
  if (!id) throw new UnauthorizedError("Authentication required");
  return id;
}

export class TeamController {
  async createTeam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { name, description } = req.body || {};
      const data = await teamService.createTeam(userId, name, description);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Team created successfully",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyTeam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const data = await teamService.getUserTeam(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data ? "User team retrieved" : "User has no team",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getTeamById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = await teamService.getTeamById(id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team details retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async inviteUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: teamId } = req.params;
      const { targetUserId } = req.body || {};
      if (!targetUserId) throw new BadRequestError("targetUserId is required");

      const data = await teamService.inviteUser(teamId, userId, targetUserId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Invitation sent successfully",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyInvitations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const data = await teamService.getUserInvitations(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User invitations retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async acceptInvitation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: invitationId } = req.params;
      const data = await teamService.acceptInvitation(userId, invitationId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Invitation accepted",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async rejectInvitation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: invitationId } = req.params;
      const data = await teamService.rejectInvitation(userId, invitationId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Invitation rejected",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async leaveTeam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: teamId } = req.params;
      const data = await teamService.leaveTeam(userId, teamId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.message,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async removeMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: teamId, userId: targetUserId } = req.params;
      const data = await teamService.removeMember(userId, teamId, targetUserId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.message,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateMemberRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: teamId, userId: targetUserId } = req.params;
      const { role } = req.body || {};
      if (!role) throw new BadRequestError("role is required");

      const data = await teamService.updateMemberRole(userId, teamId, targetUserId, role);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.message,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async transferOwnership(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: teamId } = req.params;
      const { newOwnerUserId } = req.body || {};
      if (!newOwnerUserId) throw new BadRequestError("newOwnerUserId is required");

      const data = await teamService.transferOwnership(userId, teamId, newOwnerUserId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.message,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const teamController = new TeamController();
