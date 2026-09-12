import { Response, NextFunction } from "express";
import { ReportService } from "../services/report.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { BadRequestError, UnauthorizedError } from "../utils/errors/app.error";
import { forwardAdminAudit } from "../utils/helpers/audit.helper";
import type { ReportReason, ReportStatus, ReportTargetType } from "../models/report.model";

const TARGETS = new Set(["USER", "DISCUSSION", "COMMENT", "PROBLEM", "SUBMISSION"]);
const REASONS = new Set([
  "SPAM",
  "ABUSE",
  "HARASSMENT",
  "INCORRECT_CONTENT",
  "BUG",
  "COPYRIGHT",
  "CHEATING",
  "OTHER",
]);

export class ReportController {
  constructor(private reportService: ReportService) {}

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const { targetType, targetId, reason, description } = req.body;
      if (!TARGETS.has(targetType)) throw new BadRequestError("Invalid targetType");
      if (!REASONS.has(reason)) throw new BadRequestError("Invalid reason");
      const report = await this.reportService.createReport({
        reporterId: req.user.userId,
        targetType: targetType as ReportTargetType,
        targetId: String(targetId),
        reason: reason as ReportReason,
        description,
      });
      res.status(201).json({ success: true, message: "Report submitted", data: report });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.reportService.listReports({
        status: req.query.status as ReportStatus | undefined,
        targetType: req.query.targetType as ReportTargetType | undefined,
        priority: req.query.priority ? String(req.query.priority) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });
      res.status(200).json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await this.reportService.getReport(String(req.params.id));
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }

  async assign(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const assigneeId = req.body.assignedTo || req.user.userId;
      const report = await this.reportService.assign(String(req.params.id), assigneeId);
      await forwardAdminAudit({
        authorizationHeader: req.headers.authorization,
        action: "report.assign",
        resource: "report",
        resourceId: String(req.params.id),
        after: { assignedTo: assigneeId, status: report.status },
      });
      res.status(200).json({ success: true, message: "Report assigned", data: report });
    } catch (error) {
      next(error);
    }
  }

  async review(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const report = await this.reportService.setStatus(
        String(req.params.id),
        "UNDER_REVIEW",
        req.user.userId
      );
      await forwardAdminAudit({
        authorizationHeader: req.headers.authorization,
        action: "report.review",
        resource: "report",
        resourceId: String(req.params.id),
        after: { status: report.status },
      });
      res.status(200).json({ success: true, message: "Report under review", data: report });
    } catch (error) {
      next(error);
    }
  }

  async resolve(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const report = await this.reportService.setStatus(
        String(req.params.id),
        "RESOLVED",
        req.user.userId,
        req.body.resolution
      );
      await forwardAdminAudit({
        authorizationHeader: req.headers.authorization,
        action: "report.resolve",
        resource: "report",
        resourceId: String(req.params.id),
        after: { status: report.status, resolution: report.resolution },
      });
      res.status(200).json({ success: true, message: "Report resolved", data: report });
    } catch (error) {
      next(error);
    }
  }

  async dismiss(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const report = await this.reportService.setStatus(
        String(req.params.id),
        "DISMISSED",
        req.user.userId,
        req.body.resolution
      );
      await forwardAdminAudit({
        authorizationHeader: req.headers.authorization,
        action: "report.dismiss",
        resource: "report",
        resourceId: String(req.params.id),
        after: { status: report.status },
      });
      res.status(200).json({ success: true, message: "Report dismissed", data: report });
    } catch (error) {
      next(error);
    }
  }

  async reopen(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const report = await this.reportService.setStatus(
        String(req.params.id),
        "OPEN",
        req.user.userId
      );
      await forwardAdminAudit({
        authorizationHeader: req.headers.authorization,
        action: "report.reopen",
        resource: "report",
        resourceId: String(req.params.id),
        after: { status: report.status },
      });
      res.status(200).json({ success: true, message: "Report reopened", data: report });
    } catch (error) {
      next(error);
    }
  }
}
