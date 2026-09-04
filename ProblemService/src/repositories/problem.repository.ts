import { Problem, IProblem } from "../models/problem.model";
import { ProblemQueryDto } from "../validators/problem.validator";

export interface IProblemRepository {
  createProblem(data: Partial<IProblem>): Promise<IProblem>;
  updateProblem(id: string, data: Partial<IProblem>): Promise<IProblem | null>;
  deleteProblem(id: string): Promise<boolean>;
  getProblemById(id: string): Promise<IProblem | null>;
  getProblemBySlug(slug: string): Promise<IProblem | null>;
  getProblems(query: ProblemQueryDto): Promise<{
    problems: IProblem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  findByDifficulty(difficulty: "easy" | "medium" | "hard"): Promise<IProblem[]>;
  searchProblems(query: string): Promise<IProblem[]>;
}

export class ProblemRepository implements IProblemRepository {
  async createProblem(problem: Partial<IProblem>): Promise<IProblem> {
    const slug = problem.slug || slugify(problem.title || "");
    return await Problem.create({ ...problem, slug });
  }

  async updateProblem(
    id: string,
    problem: Partial<IProblem>
  ): Promise<IProblem | null> {
    const updateData: Partial<IProblem> = { ...problem };
    if (problem.title) {
      updateData.slug = slugify(problem.title);
    }
    return await Problem.findByIdAndUpdate(id, updateData, { new: true });
  }

  async deleteProblem(id: string): Promise<boolean> {
    const res = await Problem.findByIdAndDelete(id);
    return res !== null;
  }

  async getProblemById(id: string): Promise<IProblem | null> {
    return await Problem.findById(id);
  }

  async getProblemBySlug(slug: string): Promise<IProblem | null> {
    return await Problem.findOne({ slug });
  }

  async getProblems(query: ProblemQueryDto): Promise<{
    problems: IProblem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (query.difficulty) {
      filter.difficulty = query.difficulty;
    }

    if (query.category) {
      filter.category = new RegExp(query.category, "i");
    }

    if (query.tag) {
      filter.tags = { $in: [new RegExp(query.tag, "i")] };
    }

    if (query.search) {
      filter.$or = [
        { title: new RegExp(query.search, "i") },
        { category: new RegExp(query.search, "i") },
        { tags: { $in: [new RegExp(query.search, "i")] } },
      ];
    }

    const [problems, total] = await Promise.all([
      Problem.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Problem.countDocuments(filter),
    ]);

    return {
      problems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByDifficulty(
    difficulty: "easy" | "medium" | "hard"
  ): Promise<IProblem[]> {
    return await Problem.find({ difficulty }).sort({ createdAt: -1 });
  }

  async searchProblems(query: string): Promise<IProblem[]> {
    return await Problem.find({
      $or: [
        { title: new RegExp(query, "i") },
        { category: new RegExp(query, "i") },
        { tags: { $in: [new RegExp(query, "i")] } },
      ],
    }).sort({ createdAt: -1 });
  }
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
}
