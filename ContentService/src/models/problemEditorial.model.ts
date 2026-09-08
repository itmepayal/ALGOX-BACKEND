import { Schema, model, Document, Types } from "mongoose";

export interface ICodeSnippet {
  language: "cpp" | "java" | "python" | "javascript" | "typescript" | "golang" | "csharp";
  code: string;
}

export interface IEditorialSolution {
  title: string;
  approachName: string; // e.g. "Approach 1: Hash Map (One-pass)"
  explanation: string; // Markdown formatted detailed editorial explanation
  timeComplexity: string; // e.g. "O(N)"
  spaceComplexity: string; // e.g. "O(N)"
  codeSnippets: ICodeSnippet[];
}

export interface IProblemEditorial extends Document {
  problemId: Types.ObjectId; // Linked LeetCode Problem
  videoUrl?: string; // YouTube / LeetCode Official Video Solution URL
  hints: string[]; // Step-by-step hints (e.g. Hint 1, Hint 2)
  solutions: IEditorialSolution[]; // Multiple solution approaches
  isPremiumOnly: boolean;
}

const problemEditorialSchema = new Schema<IProblemEditorial>(
  {
    problemId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    videoUrl: { type: String },
    hints: [{ type: String }],
    solutions: [
      {
        title: { type: String, required: true },
        approachName: { type: String, required: true },
        explanation: { type: String, required: true },
        timeComplexity: { type: String, required: true },
        spaceComplexity: { type: String, required: true },
        codeSnippets: [
          {
            language: { type: String, required: true },
            code: { type: String, required: true },
          },
        ],
      },
    ],
    isPremiumOnly: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const ProblemEditorial = model<IProblemEditorial>(
  "ProblemEditorial",
  problemEditorialSchema
);
