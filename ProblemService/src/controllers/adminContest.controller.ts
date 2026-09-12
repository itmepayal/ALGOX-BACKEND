import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { contestService, type ActorCtx } from "../services/contest.service";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import {
  addContestProblemSchema,
  createContestSchema,
  updateContestSchema,
} from "../validators/contest.validator";

function actorFrom(req: AuthenticatedRequest): ActorCtx {
  return {
    userId: req.user!.userId,
    email: req.user!.email,
    authorization: req.headers.authorization,
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  };
}

async function audit(
  req: AuthenticatedRequest,
  action: string,
  resourceId?: string,
  after?: Record<string, unknown>
) {
  const a = actorFrom(req);
  await writeAdminAudit({
    actorId: a.userId,
    actorEmail: a.email,
    action,
    resource: "contest",
    resourceId,
    after,
    ip: a.ip,
    userAgent: a.userAgent,
    authorization: a.authorization,
  });
}

export class AdminContestController {
  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const includeArchived = String(req.query.includeArchived || "true") !== "false";
      const data = await contestService.listContests(includeArchived);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contests retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = createContestSchema.parse(req.body);
      const data = await contestService.createContest(body, actorFrom(req));
      await audit(req, "contest.create", String(data._id), {
        slug: body.slug,
        title: body.title,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Contest created",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  get = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await contestService.getContestById(String(req.params.contestId));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const contestId = String(req.params.contestId);
      const body = updateContestSchema.parse(req.body);
      const data = await contestService.updateContest(
        contestId,
        body,
        actorFrom(req)
      );
      await audit(req, "contest.update", contestId, body as Record<string, unknown>);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest updated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  remove = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const contestId = String(req.params.contestId);
      const data = await contestService.deleteContest(contestId);
      await audit(req, "contest.delete", contestId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest deleted",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  publish = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const contestId = String(req.params.contestId);
      const data = await contestService.publish(contestId, actorFrom(req));
      await audit(req, "contest.publish", contestId, { status: data.status });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest published (scheduled)",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  schedule = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const contestId = String(req.params.contestId);
      const data = await contestService.schedule(contestId, actorFrom(req));
      await audit(req, "contest.schedule", contestId, { status: data.status });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest scheduled",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  start = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const contestId = String(req.params.contestId);
      const data = await contestService.start(contestId, actorFrom(req));
      await audit(req, "contest.start", contestId, { status: data.status });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest started",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  end = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const contestId = String(req.params.contestId);
      const data = await contestService.end(contestId, actorFrom(req));
      await audit(req, "contest.end", contestId, { status: data.status });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest ended",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  archive = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const contestId = String(req.params.contestId);
      const data = await contestService.archive(contestId, actorFrom(req));
      await audit(req, "contest.archive", contestId, { status: data.status });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest archived",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  addProblem = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const contestId = String(req.params.contestId);
      const body = addContestProblemSchema.parse(req.body);
      const data = await contestService.addProblem(contestId, body);
      await audit(req, "contest.problem.add", contestId, {
        problemId: body.problemId,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Problem added to contest",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  removeProblem = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const contestId = String(req.params.contestId);
      const problemId = String(req.params.problemId);
      const data = await contestService.removeProblem(contestId, problemId);
      await audit(req, "contest.problem.remove", contestId, { problemId });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Problem removed from contest",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  listParticipants = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const contestId = String(req.params.contestId);
      const data = await contestService.listParticipants(contestId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Participants retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  leaderboard = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const contestId = String(req.params.contestId);
      const recompute = String(req.query.recompute || "") === "true";
      const data = await contestService.getLeaderboard(contestId, recompute);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest leaderboard retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const adminContestController = new AdminContestController();
