import { IProblem, Problem } from "../models/problem.model";

export interface IProblemRepository {
  createProblem(problem: Partial<IProblem>): Promise<IProblem>;
  getProblemById(id: string): Promise<IProblem | null>;
  getAllProblems(): Promise<{ problems: IProblem[]; total: number }>;
  updateProblem(
    id: string,
    problem: Partial<IProblem>,
  ): Promise<IProblem | null>;
  deleteProblem(id: string): Promise<boolean>;
  findByDifficulty(difficulty: "easy" | "medium" | "hard"): Promise<IProblem[]>;
  searchProblems(query: string): Promise<IProblem[]>;
}

export class ProblemRepository implements IProblemRepository {
  async createProblem(problem: Partial<IProblem>): Promise<IProblem> {
    return await Problem.create(problem);
  }

  async getProblemById(id: string): Promise<IProblem | null> {
    return await Problem.findById(id);
  }

  async getAllProblems(): Promise<{ problems: IProblem[]; total: number }> {
    const problems = await Problem.find().sort({
      createdAt: -1,
    });
    const total = await Problem.countDocuments();
    return { problems, total };
  }

  async updateProblem(
    id: string,
    problem: Partial<IProblem>,
  ): Promise<IProblem | null> {
    return await Problem.findByIdAndUpdate(id, problem, { new: true });
  }

  async deleteProblem(id: string): Promise<boolean> {
    const result = await Problem.findByIdAndDelete(id);
    return !!result;
  }

  async findByDifficulty(
    difficulty: "easy" | "medium" | "hard",
  ): Promise<IProblem[]> {
    return await Problem.find({ difficulty }).sort({
      createdAt: -1,
    });
  }

  async searchProblems(query: string): Promise<IProblem[]> {
    return await Problem.find({
      $or: [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ],
    });
  }
}
