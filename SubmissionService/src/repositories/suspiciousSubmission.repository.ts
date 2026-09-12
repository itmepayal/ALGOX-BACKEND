import {
  SuspiciousSubmission,
  ISuspiciousSubmission,
  SuspiciousSeverity,
  SuspiciousStatus,
} from "../models/suspiciousSubmission.model";

export interface SuspiciousListFilters {
  page?: number;
  limit?: number;
  status?: string;
  severity?: string;
  userId?: string;
}

export interface ISuspiciousSubmissionRepository {
  list(filters: SuspiciousListFilters): Promise<{
    items: ISuspiciousSubmission[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getById(id: string): Promise<ISuspiciousSubmission | null>;
  updateReview(
    id: string,
    data: {
      status: SuspiciousStatus;
      reviewedBy: string;
      resolution?: string;
    }
  ): Promise<ISuspiciousSubmission | null>;
}

export class SuspiciousSubmissionRepository
  implements ISuspiciousSubmissionRepository
{
  async list(filters: SuspiciousListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (filters.status && filters.status !== "all") {
      filter.status = filters.status as SuspiciousStatus;
    }
    if (filters.severity && filters.severity !== "all") {
      filter.severity = filters.severity as SuspiciousSeverity;
    } else {
      // Never surface NORMAL noise (should not exist, but filter anyway)
      filter.severity = { $ne: "NORMAL" };
    }
    if (filters.userId) {
      filter.userId = filters.userId;
    }

    const [items, total] = await Promise.all([
      SuspiciousSubmission.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SuspiciousSubmission.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getById(id: string): Promise<ISuspiciousSubmission | null> {
    return SuspiciousSubmission.findById(id);
  }

  async updateReview(
    id: string,
    data: {
      status: SuspiciousStatus;
      reviewedBy: string;
      resolution?: string;
    }
  ): Promise<ISuspiciousSubmission | null> {
    return SuspiciousSubmission.findByIdAndUpdate(
      id,
      {
        status: data.status,
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        ...(data.resolution !== undefined && { resolution: data.resolution }),
      },
      { new: true }
    );
  }
}
