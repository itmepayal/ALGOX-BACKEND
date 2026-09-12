import mongoose, { Document, Schema } from "mongoose";

export type ProblemStatus = "draft" | "published" | "archived";

export interface ITestcase {
  input: any;
  output?: string;
  expectedOutput?: string;
  isHidden?: boolean;
  order?: number;
  explanation?: string;
  weight?: number;
}

export interface ICodeStub {
  language: "python" | "javascript" | "cpp" | "java";
  startSnippet: string;
  userTemplate: string;
}

export interface IProblemExample {
  input: any;
  output: string;
  explanation?: string;
}

export interface IProblemResource {
  type: "youtube" | "article" | "editorial" | "docs" | "practice";
  url: string;
  label?: string;
  isPremium?: boolean;
}

export interface IProblem extends Document {
  title: string;
  slug: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  status: ProblemStatus;
  category: string;
  tags: string[];
  editorial?: string;
  hints?: string[];
  constraints?: string;
  examples?: IProblemExample[];
  codeStubs: ICodeStub[];
  starterCode?: Record<string, string>;
  testcases: ITestcase[];
  functionName?: string;
  className?: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  /** External / internal learning resources for the DSA sheet */
  resources?: IProblemResource[];
  videoUrl?: string;
  articleUrl?: string;
  practiceUrl?: string;
  createdBy?: string;
  updatedBy?: string;
  publishedAt?: Date;
  /** Denormalized engagement counters (source of truth for list display). */
  likeCount?: number;
  dislikeCount?: number;
  bookmarkCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const testcaseSchema = new Schema(
  {
    // Mixed: supports "[1,2]" strings and { nums: [...] } objects
    input: { type: Schema.Types.Mixed, required: true },
    output: { type: String, trim: true },
    expectedOutput: { type: String, trim: true },
    isHidden: { type: Boolean, default: false },
    order: { type: Number },
    explanation: { type: String },
    weight: { type: Number, default: 1 },
  },
  { _id: true },
);

const codeStubSchema = new Schema<ICodeStub>(
  {
    language: {
      type: String,
      enum: ["python", "javascript", "cpp", "java"],
      required: true,
    },
    startSnippet: { type: String, default: "" },
    userTemplate: { type: String, required: true },
  },
  { _id: false },
);

const exampleSchema = new Schema(
  {
    input: { type: Schema.Types.Mixed, required: true },
    output: { type: String, required: true },
    explanation: { type: String },
  },
  { _id: false },
);

const problemSchema = new Schema<IProblem>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    editorial: {
      type: String,
    },
    hints: { type: [String], default: [] },
    constraints: { type: String },
    examples: [exampleSchema],
    codeStubs: [codeStubSchema],
    starterCode: { type: Schema.Types.Mixed },
    testcases: [testcaseSchema],
    functionName: { type: String },
    className: { type: String },
    timeLimitMs: { type: Number, default: 2000 },
    memoryLimitMb: { type: Number, default: 256 },
    createdBy: { type: String, index: true },
    updatedBy: { type: String },
    publishedAt: { type: Date },
    resources: [
      {
        type: {
          type: String,
          enum: ["youtube", "article", "editorial", "docs", "practice"],
          required: true,
        },
        url: { type: String, required: true },
        label: { type: String },
        isPremium: { type: Boolean, default: false },
      },
    ],
    videoUrl: { type: String },
    articleUrl: { type: String },
    practiceUrl: { type: String },
    likeCount: { type: Number, default: 0, min: 0, index: true },
    dislikeCount: { type: Number, default: 0, min: 0 },
    bookmarkCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    strict: false,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        // Normalize output aliases for clients
        if (Array.isArray(ret.testcases)) {
          ret.testcases = ret.testcases.map((tc: any) => ({
            ...tc,
            output: tc.output ?? tc.expectedOutput ?? "",
            expectedOutput: tc.expectedOutput ?? tc.output ?? "",
          }));
        }
        return ret;
      },
    },
  },
);

problemSchema.index({ title: 1 }, { unique: true });
problemSchema.index({ difficulty: 1 });
problemSchema.index({ category: 1, difficulty: 1 });
problemSchema.index({ status: 1, difficulty: 1 });
problemSchema.index({ status: 1, createdAt: -1 });

export const Problem = mongoose.model<IProblem>("Problem", problemSchema);
