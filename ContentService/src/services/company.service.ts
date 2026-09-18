import {
  companyRepository,
  sanitizeQuestion,
} from "../repositories/company.repository";
import type {
  CompanyDirectoryQuery,
  CompanyQuestionsQuery,
  CreateCompanyDto,
  CreateCompanyQuestionDto,
  UpdateCompanyDto,
  UpdateCompanyQuestionDto,
} from "../validators/company.validator";

export type CompanyAccessContext = {
  canAccessCompanyQuestions: boolean;
};

function companyPublicCard(company: any, questionCount: number) {
  return {
    id: company.id || String(company._id),
    name: company.name,
    slug: company.slug,
    description: company.description || "",
    logoUrl: company.logoUrl || undefined,
    isPremium: Boolean(company.isPremium),
    freePreviewLimit: Number(company.freePreviewLimit) || 0,
    isPublished: Boolean(company.isPublished),
    roles: Array.isArray(company.roles) ? company.roles : [],
    questionCount,
  };
}

export class CompanyService {
  async createCompany(data: CreateCompanyDto) {
    return companyRepository.createCompany(data);
  }

  async updateCompany(id: string, data: UpdateCompanyDto) {
    const updated = await companyRepository.updateCompany(id, data);
    if (!updated) {
      const err: any = new Error("Company not found");
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  async deleteCompany(id: string) {
    const ok = await companyRepository.deleteCompany(id);
    if (!ok) {
      const err: any = new Error("Company not found");
      err.statusCode = 404;
      throw err;
    }
    return true;
  }

  async adminListCompanies(query: CompanyDirectoryQuery) {
    const result = await companyRepository.listCompanies(query, {
      publicOnly: false,
    });
    const withCounts = await Promise.all(
      result.companies.map(async (c: any) => {
        const count = await companyRepository.countQuestions(c.id);
        return { ...c, questionCount: count };
      })
    );
    return { ...result, companies: withCounts };
  }

  async adminGetCompany(id: string) {
    const company = await companyRepository.getCompanyById(id);
    if (!company) {
      const err: any = new Error("Company not found");
      err.statusCode = 404;
      throw err;
    }
    const o: any =
      typeof (company as any).toObject === "function"
        ? (company as any).toObject()
        : company;
    o.id = String(o._id);
    o.questionCount = await companyRepository.countQuestions(o.id);
    return o;
  }

  async createQuestion(companyId: string, data: CreateCompanyQuestionDto) {
    const company = await companyRepository.getCompanyById(companyId);
    if (!company) {
      const err: any = new Error("Company not found");
      err.statusCode = 404;
      throw err;
    }
    return companyRepository.createQuestion(companyId, data);
  }

  async updateQuestion(questionId: string, data: UpdateCompanyQuestionDto) {
    const updated = await companyRepository.updateQuestion(questionId, data);
    if (!updated) {
      const err: any = new Error("Question not found");
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  async deleteQuestion(questionId: string) {
    const ok = await companyRepository.deleteQuestion(questionId);
    if (!ok) {
      const err: any = new Error("Question not found");
      err.statusCode = 404;
      throw err;
    }
    return true;
  }

  async adminListQuestions(companyId: string, query: CompanyQuestionsQuery) {
    const result = await companyRepository.listQuestions(companyId, query);
    return {
      ...result,
      questions: result.questions.map((q) => sanitizeQuestion(q, { full: true })),
    };
  }

  /** Public directory — configured published companies only. */
  async listDirectory(query: CompanyDirectoryQuery) {
    const result = await companyRepository.listCompanies(query, {
      publicOnly: true,
    });
    const companies = await Promise.all(
      result.companies.map(async (c: any) => {
        const count = await companyRepository.countQuestions(c.id);
        return companyPublicCard(c, count);
      })
    );
    return { ...result, companies };
  }

  /**
   * Company page + filtered questions with premium gating.
   * Free: limited preview of non-premium questions (freePreviewLimit).
   * Premium entitlement: full configured dataset.
   */
  async getCompanyPage(
    slug: string,
    query: CompanyQuestionsQuery,
    access: CompanyAccessContext
  ) {
    const company = await companyRepository.getCompanyBySlug(slug);
    if (!company || !(company as any).isPublished) {
      const err: any = new Error("Company not found");
      err.statusCode = 404;
      throw err;
    }
    const c: any =
      typeof (company as any).toObject === "function"
        ? (company as any).toObject()
        : company;
    c.id = String(c._id);

    const fullAccess = access.canAccessCompanyQuestions;
    const previewLimit = Number(c.freePreviewLimit) || 0;

    // Facets from configured data only (full set for entitled; preview-aware for free)
    const [allTopics, allRoles, difficulty, totalConfigured] = await Promise.all([
      companyRepository.distinctTopics(c.id),
      companyRepository.distinctRoles(c.id),
      companyRepository.difficultyBreakdown(c.id),
      companyRepository.countQuestions(c.id),
    ]);

    // Merge company.roles config with roles seen on questions
    const roleSet = new Set<string>([
      ...(Array.isArray(c.roles) ? c.roles.map(String) : []),
      ...allRoles,
    ]);
    const roles = Array.from(roleSet).filter(Boolean).sort();

    if (fullAccess) {
      const result = await companyRepository.listQuestions(c.id, query);
      return {
        company: {
          ...companyPublicCard(c, totalConfigured),
          access: "full" as const,
        },
        topics: allTopics,
        roles,
        difficulty,
        questions: result.questions.map((q) => sanitizeQuestion(q)),
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
          preview: false,
          configuredTotal: totalConfigured,
        },
      };
    }

    // Free / guest: only non-premium questions, capped by freePreviewLimit
    if (previewLimit <= 0 && c.isPremium) {
      return {
        company: {
          ...companyPublicCard(c, totalConfigured),
          access: "locked" as const,
        },
        topics: allTopics,
        roles,
        difficulty,
        questions: [],
        meta: {
          total: 0,
          page: 1,
          limit: query.limit || 20,
          totalPages: 1,
          preview: true,
          previewLimit: 0,
          configuredTotal: totalConfigured,
          upgradeRequired: true,
        },
      };
    }

    const effectiveLimit = Math.max(0, previewLimit);
    if (effectiveLimit === 0) {
      return {
        company: {
          ...companyPublicCard(c, totalConfigured),
          access: "preview" as const,
        },
        topics: allTopics,
        roles,
        difficulty,
        questions: [],
        meta: {
          total: 0,
          page: 1,
          limit: query.limit || 20,
          totalPages: 1,
          preview: true,
          previewLimit: 0,
          configuredTotal: totalConfigured,
          upgradeRequired: Boolean(c.isPremium),
        },
      };
    }

    // Fetch first page of free questions then slice to preview limit (no invented padding)
    const freePool = await companyRepository.listQuestions(c.id, {
      ...query,
      access: "free",
      page: 1,
      limit: Math.min(100, effectiveLimit),
    });
    // Apply client page within the preview window only
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, effectiveLimit);
    const start = (page - 1) * limit;
    const window = freePool.questions.slice(0, effectiveLimit);
    const pageRows = window.slice(start, start + limit);
    const previewTotal = window.length;

    return {
      company: {
        ...companyPublicCard(c, totalConfigured),
        access: "preview" as const,
      },
      topics: allTopics,
      roles,
      difficulty,
      questions: pageRows.map((q) => sanitizeQuestion(q)),
      meta: {
        total: previewTotal,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(previewTotal / limit)),
        preview: true,
        previewLimit: effectiveLimit,
        configuredTotal: totalConfigured,
        upgradeRequired: totalConfigured > previewTotal || Boolean(c.isPremium),
      },
    };
  }
}

export const companyService = new CompanyService();
