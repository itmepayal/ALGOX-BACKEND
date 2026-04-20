import { Types } from "mongoose";
import {
  ISubmission,
  Submission,
  SubmissionStatus,
} from "../models/submission.model";

export interface ISubmissionRepository {
  createSubmission(submission: Partial<ISubmission>): Promise<ISubmission>;

  getByProblemId(problemId: string): Promise<ISubmission[]>;

  getSubmissionById(id: string): Promise<ISubmission | null>;

  getAllSubmissions(
    page: number,
    limit: number,
  ): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    totalPages: number;
  }>;

  updateSubmission(
    submissionId: string,
    submission: Partial<ISubmission>,
  ): Promise<ISubmission | null>;

  deleteSubmission(submissionId: string): Promise<boolean>;

  getByStatus(status: SubmissionStatus): Promise<ISubmission[]>;

  getByLanguage(language: string): Promise<ISubmission[]>;

  searchSubmissions(query: string): Promise<ISubmission[]>;
}

export class SubmissionRepository implements ISubmissionRepository {
  async createSubmission(
    submission: Partial<ISubmission>,
  ): Promise<ISubmission> {
    return await Submission.create(submission);
  }

  async getByProblemId(problemId: string): Promise<ISubmission[]> {
    if (!Types.ObjectId.isValid(problemId)) return [];

    return await Submission.find({ problemId }).sort({ createdAt: -1 }).lean();
  }

  async getSubmissionById(id: string): Promise<ISubmission | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    return await Submission.findById(id).lean();
  }

  async getAllSubmissions(
    page: number,
    limit: number,
  ): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.max(limit, 1);
    const skip = (safePage - 1) * safeLimit;

    const [submissions, total] = await Promise.all([
      Submission.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Submission.countDocuments(),
    ]);

    return {
      submissions,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async updateSubmission(
    submissionId: string,
    submission: Partial<ISubmission>,
  ): Promise<ISubmission | null> {
    if (!Types.ObjectId.isValid(submissionId)) return null;

    return await Submission.findByIdAndUpdate(submissionId, submission, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async deleteSubmission(submissionId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(submissionId)) return false;

    const result = await Submission.findByIdAndDelete(submissionId);
    return !!result;
  }

  async getByStatus(status: SubmissionStatus): Promise<ISubmission[]> {
    return await Submission.find({ status }).sort({ createdAt: -1 }).lean();
  }

  async getByLanguage(language: string): Promise<ISubmission[]> {
    return await Submission.find({ language }).sort({ createdAt: -1 }).lean();
  }

  async searchSubmissions(query: string): Promise<ISubmission[]> {
    return await Submission.find(
      { $text: { $search: query } },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .lean();
  }
}
