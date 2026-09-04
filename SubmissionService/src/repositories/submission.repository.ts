import { Submission, ISubmission, SubmissionStatus } from "../models/submission.model";

export interface ISubmissionRepository {
  createSubmission(data: Partial<ISubmission>): Promise<ISubmission>;
  getSubmissionById(id: string): Promise<ISubmission | null>;
  getAllSubmissions(
    page: number,
    limit: number
  ): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  updateSubmission(
    id: string,
    data: Partial<ISubmission>
  ): Promise<ISubmission | null>;
  deleteSubmission(id: string): Promise<boolean>;
  getByProblemId(problemId: string): Promise<ISubmission[]>;
  getByUserId(userId: string): Promise<ISubmission[]>;
  getByStatus(status: SubmissionStatus): Promise<ISubmission[]>;
  getByLanguage(language: string): Promise<ISubmission[]>;
  searchSubmissions(query: string): Promise<ISubmission[]>;
}

export class SubmissionRepository implements ISubmissionRepository {
  async createSubmission(data: Partial<ISubmission>): Promise<ISubmission> {
    return await Submission.create(data);
  }

  async getSubmissionById(id: string): Promise<ISubmission | null> {
    return await Submission.findById(id);
  }

  async getAllSubmissions(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [submissions, total] = await Promise.all([
      Submission.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Submission.countDocuments(),
    ]);

    return {
      submissions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateSubmission(
    id: string,
    data: Partial<ISubmission>
  ): Promise<ISubmission | null> {
    return await Submission.findByIdAndUpdate(id, data, { new: true });
  }

  async deleteSubmission(id: string): Promise<boolean> {
    const deleted = await Submission.findByIdAndDelete(id);
    return deleted !== null;
  }

  async getByProblemId(problemId: string): Promise<ISubmission[]> {
    return await Submission.find({ problemId }).sort({ createdAt: -1 });
  }

  async getByUserId(userId: string): Promise<ISubmission[]> {
    return await Submission.find({ userId }).sort({ createdAt: -1 });
  }

  async getByStatus(status: SubmissionStatus): Promise<ISubmission[]> {
    return await Submission.find({ status }).sort({ createdAt: -1 });
  }

  async getByLanguage(language: string): Promise<ISubmission[]> {
    return await Submission.find({ language }).sort({ createdAt: -1 });
  }

  async searchSubmissions(query: string): Promise<ISubmission[]> {
    return await Submission.find({
      $or: [
        { status: new RegExp(query, "i") },
        { language: new RegExp(query, "i") },
      ],
    }).sort({ createdAt: -1 });
  }
}
