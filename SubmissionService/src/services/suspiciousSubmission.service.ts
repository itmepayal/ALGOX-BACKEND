import {
  ISuspiciousSubmission,
  SuspiciousStatus,
} from "../models/suspiciousSubmission.model";
import {
  ISuspiciousSubmissionRepository,
  SuspiciousListFilters,
} from "../repositories/suspiciousSubmission.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { writeAuthAdminAudit } from "../apis/authAudit.api";

export interface ReviewActor {
  userId: string;
  email?: string;
  authorizationHeader?: string;
  ip?: string;
  userAgent?: string;
}

export interface ISuspiciousSubmissionService {
  list(filters: SuspiciousListFilters): Promise<{
    items: ISuspiciousSubmission[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getById(id: string): Promise<ISuspiciousSubmission>;
  markReviewing(
    id: string,
    actor: ReviewActor,
    resolution?: string
  ): Promise<ISuspiciousSubmission>;
  confirm(
    id: string,
    actor: ReviewActor,
    resolution?: string
  ): Promise<ISuspiciousSubmission>;
  dismiss(
    id: string,
    actor: ReviewActor,
    resolution?: string
  ): Promise<ISuspiciousSubmission>;
}

export class SuspiciousSubmissionService implements ISuspiciousSubmissionService {
  constructor(private repo: ISuspiciousSubmissionRepository) {}

  async list(filters: SuspiciousListFilters) {
    return this.repo.list(filters);
  }

  async getById(id: string): Promise<ISuspiciousSubmission> {
    if (!id) throw new BadRequestError("Suspicious submission id is required");
    const row = await this.repo.getById(id);
    if (!row) throw new NotFoundError("Suspicious submission not found");
    return row;
  }

  private async applyStatus(
    id: string,
    status: SuspiciousStatus,
    actor: ReviewActor,
    resolution: string | undefined,
    action: string
  ): Promise<ISuspiciousSubmission> {
    const before = await this.getById(id);

    if (status === "REVIEWING" && before.status !== "FLAGGED" && before.status !== "REVIEWING") {
      throw new BadRequestError(
        `Cannot mark REVIEWING from status ${before.status}`
      );
    }
    if (
      (status === "CONFIRMED" || status === "DISMISSED") &&
      before.status === "CONFIRMED"
    ) {
      throw new BadRequestError("Already confirmed");
    }
    if (
      (status === "CONFIRMED" || status === "DISMISSED") &&
      before.status === "DISMISSED"
    ) {
      throw new BadRequestError("Already dismissed");
    }

    // NEVER auto-ban — confirm only records admin judgment for review workflows.
    const updated = await this.repo.updateReview(id, {
      status,
      reviewedBy: actor.userId,
      resolution: resolution ?? before.resolution ?? "",
    });

    if (!updated) throw new NotFoundError("Suspicious submission not found");

    await writeAuthAdminAudit({
      action,
      resource: "suspicious_submission",
      resourceId: id,
      before: {
        status: before.status,
        score: before.score,
        severity: before.severity,
      },
      after: {
        status: updated.status,
        resolution: updated.resolution,
        reviewedBy: actor.userId,
      },
      authorizationHeader: actor.authorizationHeader,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return updated;
  }

  async markReviewing(id: string, actor: ReviewActor, resolution?: string) {
    return this.applyStatus(
      id,
      "REVIEWING",
      actor,
      resolution,
      "suspicious.review.start"
    );
  }

  async confirm(id: string, actor: ReviewActor, resolution?: string) {
    return this.applyStatus(
      id,
      "CONFIRMED",
      actor,
      resolution,
      "suspicious.review.confirm"
    );
  }

  async dismiss(id: string, actor: ReviewActor, resolution?: string) {
    return this.applyStatus(
      id,
      "DISMISSED",
      actor,
      resolution,
      "suspicious.review.dismiss"
    );
  }
}
