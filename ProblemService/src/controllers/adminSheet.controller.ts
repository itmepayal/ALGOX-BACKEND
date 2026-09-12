import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { sheetService, type ActorCtx } from "../services/sheet.service";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import {
  attachProblemSchema,
  bulkAttachSchema,
  createSectionSchema,
  createSheetSchema,
  createTopicSchema,
  reorderSchema,
  syncFromCatalogSchema,
  updateSectionSchema,
  updateSheetSchema,
  updateTopicSchema,
} from "../validators/sheet.validator";

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
    resource: "sheet",
    resourceId,
    after,
    ip: a.ip,
    userAgent: a.userAgent,
    authorization: a.authorization,
  });
}

export class AdminSheetController {
  list = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const includeArchived = String(req.query.includeArchived || "true") !== "false";
      const data = await sheetService.listSheets(includeArchived);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheets retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  create = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = createSheetSchema.parse(req.body);
      const data = await sheetService.createSheet(body, actorFrom(req));
      await audit(req, "sheet.create", body.sheetId, { sheetId: body.sheetId });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Sheet created",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  get = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sheetId = String(req.params.sheetId);
      const data = await sheetService.getSheetBySheetId(sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  update = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sheetId = String(req.params.sheetId);
      const body = updateSheetSchema.parse(req.body);
      const data = await sheetService.updateSheet(sheetId, body, actorFrom(req));
      await audit(req, "sheet.update", sheetId, body as Record<string, unknown>);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet updated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  remove = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sheetId = String(req.params.sheetId);
      const data = await sheetService.deleteSheet(sheetId);
      await audit(req, "sheet.delete", sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet deleted",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  publish = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sheetId = String(req.params.sheetId);
      const data = await sheetService.setStatus(sheetId, "PUBLISHED", actorFrom(req));
      await audit(req, "sheet.publish", sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet published",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  archive = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sheetId = String(req.params.sheetId);
      const data = await sheetService.setStatus(sheetId, "ARCHIVED", actorFrom(req));
      await audit(req, "sheet.archive", sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet archived",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  preview = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sheetId = String(req.params.sheetId);
      const data = await sheetService.getPreview(sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet preview",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  syncFromCatalog = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const body = syncFromCatalogSchema.parse({
        ...req.body,
        sheetId: req.params.sheetId || req.body?.sheetId,
      });
      const data = await sheetService.syncFromCatalog({
        sheetId: body.sheetId,
        publish: body.publish,
        actorId: req.user!.userId,
      });
      await audit(req, "sheet.sync_from_catalog", body.sheetId, {
        totalProblems: data.totalProblems,
        missingCount: data.missingCount,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet synced from catalog",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  createSection = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const sheetId = String(req.params.sheetId);
      const body = createSectionSchema.parse(req.body);
      const data = await sheetService.createSection(sheetId, body);
      await audit(req, "sheet.section.create", sheetId, { title: body.title });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Section created",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  reorderSections = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const sheetId = String(req.params.sheetId);
      const body = reorderSchema.parse(req.body);
      const data = await sheetService.reorderSections(sheetId, body.orderedIds);
      await audit(req, "sheet.section.reorder", sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sections reordered",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  updateSection = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const sectionId = String(req.params.sectionId);
      const body = updateSectionSchema.parse(req.body);
      const data = await sheetService.updateSection(sectionId, body);
      await audit(req, "sheet.section.update", sectionId, body as Record<string, unknown>);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Section updated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  deleteSection = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const sectionId = String(req.params.sectionId);
      const data = await sheetService.deleteSection(sectionId);
      await audit(req, "sheet.section.delete", sectionId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Section deleted",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  createTopic = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const sectionId = String(req.params.sectionId);
      const body = createTopicSchema.parse(req.body);
      const data = await sheetService.createTopic(sectionId, body);
      await audit(req, "sheet.topic.create", sectionId, { title: body.title });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Topic created",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  reorderTopics = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const sectionId = String(req.params.sectionId);
      const body = reorderSchema.parse(req.body);
      const data = await sheetService.reorderTopics(sectionId, body.orderedIds);
      await audit(req, "sheet.topic.reorder", sectionId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Topics reordered",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  updateTopic = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const topicId = String(req.params.topicId);
      const body = updateTopicSchema.parse(req.body);
      const data = await sheetService.updateTopic(topicId, body);
      await audit(req, "sheet.topic.update", topicId, body as Record<string, unknown>);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Topic updated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  deleteTopic = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const topicId = String(req.params.topicId);
      const data = await sheetService.deleteTopic(topicId);
      await audit(req, "sheet.topic.delete", topicId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Topic deleted",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  attachProblem = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const topicId = String(req.params.topicId);
      const body = attachProblemSchema.parse(req.body);
      const data = await sheetService.attachProblem(topicId, body);
      await audit(req, "sheet.problem.attach", topicId, {
        problemId: data.problemId,
        slug: data.slug,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Problem attached",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  bulkAttach = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const topicId = String(req.params.topicId);
      const body = bulkAttachSchema.parse(req.body);
      const data = await sheetService.bulkAttach(topicId, body.problems);
      await audit(req, "sheet.problem.bulk_attach", topicId, {
        attachedCount: data.attachedCount,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Problems attached",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  reorderProblems = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const topicId = String(req.params.topicId);
      const body = reorderSchema.parse(req.body);
      const data = await sheetService.reorderProblems(topicId, body.orderedIds);
      await audit(req, "sheet.problem.reorder", topicId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Problems reordered",
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
      const topicId = String(req.params.topicId);
      const problemId = String(req.params.problemId);
      const data = await sheetService.removeProblem(topicId, problemId);
      await audit(req, "sheet.problem.remove", topicId, { problemId });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Problem removed from topic",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const adminSheetController = new AdminSheetController();
