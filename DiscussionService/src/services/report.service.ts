import { Report, IReport, ReportReason, ReportTargetType, ReportStatus } from "../models/report.model";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors/app.error";
import { Types } from "mongoose";

function priorityForReason(reason: ReportReason): IReport["priority"] {
  if (reason === "CHEATING" || reason === "HARASSMENT" || reason === "ABUSE") return "HIGH";
  if (reason === "COPYRIGHT") return "CRITICAL";
  if (reason === "SPAM") return "MEDIUM";
  return "LOW";
}

export class ReportService {
  async createReport(input: {
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    description?: string;
  }): Promise<IReport> {
    if (!Types.ObjectId.isValid(input.reporterId)) {
      throw new BadRequestError("Invalid reporter");
    }
    if (!input.targetId?.trim()) throw new BadRequestError("targetId is required");

    try {
      return await Report.create({
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        description: input.description || "",
        priority: priorityForReason(input.reason),
        status: "OPEN",
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictError(
          "You already have an open report for this target with the same reason"
        );
      }
      throw err;
    }
  }

  async listReports(query: {
    status?: ReportStatus;
    targetType?: ReportTargetType;
    priority?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.min(Math.max(query.limit || 20, 1), 100);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.priority) filter.priority = query.priority;
    if (query.search) {
      filter.$or = [
        { targetId: { $regex: query.search, $options: "i" } },
        { description: { $regex: query.search, $options: "i" } },
        { reason: { $regex: query.search, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getReport(id: string): Promise<IReport> {
    const report = await Report.findById(id);
    if (!report) throw new NotFoundError("Report not found");
    return report;
  }

  async assign(id: string, assigneeId: string): Promise<IReport> {
    const report = await this.getReport(id);
    report.assignedTo = new Types.ObjectId(assigneeId);
    if (report.status === "OPEN") report.status = "UNDER_REVIEW";
    await report.save();
    return report;
  }

  async setStatus(
    id: string,
    status: ReportStatus,
    actorId: string,
    resolution?: string
  ): Promise<IReport> {
    const report = await this.getReport(id);
    report.status = status;
    if (status === "RESOLVED" || status === "DISMISSED") {
      report.resolvedBy = new Types.ObjectId(actorId);
      report.resolvedAt = new Date();
      if (resolution !== undefined) report.resolution = resolution;
    }
    if (status === "OPEN" || status === "UNDER_REVIEW") {
      report.resolvedBy = null;
      report.resolvedAt = null;
    }
    if (status === "UNDER_REVIEW" && !report.assignedTo) {
      report.assignedTo = new Types.ObjectId(actorId);
    }
    await report.save();
    return report;
  }
}
