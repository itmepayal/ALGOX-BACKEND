import { Types } from "mongoose";
import { Company, ICompany } from "../models/company.model";
import {
  CompanyQuestion,
  ICompanyQuestion,
} from "../models/companyQuestion.model";
import type {
  CompanyDirectoryQuery,
  CompanyQuestionsQuery,
  CreateCompanyDto,
  CreateCompanyQuestionDto,
  UpdateCompanyDto,
  UpdateCompanyQuestionDto,
} from "../validators/company.validator";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function toObj(doc: any) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  o.id = String(o._id || o.id);
  return o;
}

function asObjectId(id: string) {
  try {
    return new Types.ObjectId(id);
  } catch {
    return id as any;
  }
}

/** Public projection — omit unset frequency/lastSeen rather than inventing. */
export function sanitizeQuestion(q: any, opts?: { full?: boolean }) {
  const o = toObj(q);
  if (!o) return null;
  const out: Record<string, unknown> = {
    id: o.id,
    companyId: String(o.companyId),
    problemId: o.problemId,
    title: o.title,
    slug: o.slug || undefined,
    difficulty: o.difficulty,
    topics: Array.isArray(o.topics) ? o.topics : [],
    role: o.role || undefined,
    isPremium: Boolean(o.isPremium),
    order: Number(o.order) || 0,
  };
  if (o.frequency != null && Number.isFinite(Number(o.frequency))) {
    out.frequency = Number(o.frequency);
  }
  if (o.lastSeenAt) {
    out.lastSeenAt = o.lastSeenAt;
  }
  if (opts?.full) {
    out.createdAt = o.createdAt;
    out.updatedAt = o.updatedAt;
  }
  return out;
}

export class CompanyRepository {
  async createCompany(data: CreateCompanyDto): Promise<ICompany> {
    const slug = data.slug || slugify(data.name);
    return Company.create({
      ...data,
      slug,
      logoUrl: data.logoUrl || undefined,
    });
  }

  async updateCompany(
    id: string,
    data: UpdateCompanyDto
  ): Promise<ICompany | null> {
    const payload: any = { ...data };
    if (payload.logoUrl === "") delete payload.logoUrl;
    if (payload.slug === undefined && payload.name) {
      delete payload.slug;
    }
    return Company.findByIdAndUpdate(id, { $set: payload }, { returnDocument: "after" });
  }

  async deleteCompany(id: string): Promise<boolean> {
    await CompanyQuestion.deleteMany({ companyId: id });
    const res = await Company.findByIdAndDelete(id);
    return Boolean(res);
  }

  async getCompanyById(id: string): Promise<ICompany | null> {
    return Company.findById(id);
  }

  async getCompanyBySlug(slug: string): Promise<ICompany | null> {
    return Company.findOne({ slug: String(slug).toLowerCase() });
  }

  async listCompanies(
    query: CompanyDirectoryQuery,
    opts?: { publicOnly?: boolean }
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const filter: any = {};
    if (opts?.publicOnly) filter.isPublished = true;
    if (query.search) {
      filter.$or = [
        { name: new RegExp(query.search, "i") },
        { slug: new RegExp(query.search, "i") },
      ];
    }
    if (query.premium === "premium") filter.isPremium = true;
    if (query.premium === "free") filter.isPremium = false;

    const [rows, total] = await Promise.all([
      Company.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Company.countDocuments(filter),
    ]);

    return {
      companies: rows.map(toObj),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async createQuestion(
    companyId: string,
    data: CreateCompanyQuestionDto
  ): Promise<ICompanyQuestion> {
    const payload: any = {
      companyId,
      problemId: data.problemId,
      title: data.title,
      slug: data.slug || undefined,
      difficulty: data.difficulty,
      topics: data.topics || [],
      role: data.role || undefined,
      isPremium: Boolean(data.isPremium),
      order: data.order ?? 0,
    };
    if (data.frequency !== undefined) {
      payload.frequency = data.frequency;
    }
    if (data.lastSeenAt !== undefined) {
      payload.lastSeenAt = data.lastSeenAt ? new Date(data.lastSeenAt) : null;
    }
    return CompanyQuestion.create(payload);
  }

  async updateQuestion(
    questionId: string,
    data: UpdateCompanyQuestionDto
  ): Promise<ICompanyQuestion | null> {
    const payload: any = { ...data };
    if (payload.role === "") payload.role = undefined;
    if (payload.lastSeenAt === "" || payload.lastSeenAt === null) {
      payload.lastSeenAt = null;
    } else if (typeof payload.lastSeenAt === "string") {
      payload.lastSeenAt = new Date(payload.lastSeenAt);
    }
    return CompanyQuestion.findByIdAndUpdate(
      questionId,
      { $set: payload },
      { returnDocument: "after" }
    );
  }

  async deleteQuestion(questionId: string): Promise<boolean> {
    const res = await CompanyQuestion.findByIdAndDelete(questionId);
    return Boolean(res);
  }

  async getQuestionById(id: string): Promise<ICompanyQuestion | null> {
    return CompanyQuestion.findById(id);
  }

  async listQuestions(companyId: string, query: CompanyQuestionsQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const filter: any = { companyId };
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.role) filter.role = new RegExp(`^${escapeRegex(query.role)}$`, "i");
    if (query.topic) filter.topics = new RegExp(query.topic, "i");
    if (query.access === "premium") filter.isPremium = true;
    if (query.access === "free") filter.isPremium = false;

    const [rows, total] = await Promise.all([
      CompanyQuestion.find(filter)
        .sort({ order: 1, title: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CompanyQuestion.countDocuments(filter),
    ]);

    return {
      questions: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async countQuestions(companyId: string): Promise<number> {
    return CompanyQuestion.countDocuments({ companyId });
  }

  async distinctTopics(companyId: string): Promise<string[]> {
    const topics = await CompanyQuestion.distinct("topics", { companyId });
    return (topics || []).map(String).filter(Boolean).sort();
  }

  async distinctRoles(companyId: string): Promise<string[]> {
    const roles = await CompanyQuestion.distinct("role", {
      companyId,
      role: { $nin: [null, ""] },
    });
    return (roles || []).map(String).filter(Boolean).sort();
  }

  async difficultyBreakdown(companyId: string) {
    const rows = await CompanyQuestion.aggregate([
      { $match: { companyId: asObjectId(companyId) } },
      { $group: { _id: "$difficulty", count: { $sum: 1 } } },
    ]);
    const out: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    for (const r of rows) {
      if (r._id && out[r._id as string] !== undefined) {
        out[r._id as string] = r.count;
      }
    }
    return out;
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const companyRepository = new CompanyRepository();
