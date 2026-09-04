import mongoose, { Document, Schema } from "mongoose";

export interface ITestcase {
  input: string;
  output: string;
  isHidden?: boolean;
}

export interface ICodeStub {
  language: "python" | "javascript" | "cpp" | "java";
  startSnippet: string;
  userTemplate: string;
}

export interface IProblem extends Document {
  title: string;
  slug: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  tags: string[];
  editorial?: string;
  codeStubs: ICodeStub[];
  testcases: ITestcase[];
  createdAt: Date;
  updatedAt: Date;
}

const testcaseSchema = new Schema<ITestcase>(
  {
    input: { type: String, required: true, trim: true },
    output: { type: String, required: true, trim: true },
    isHidden: { type: Boolean, default: false },
  },
  { _id: false },
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
    codeStubs: [codeStubSchema],
    testcases: [testcaseSchema],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

problemSchema.index({ title: 1 }, { unique: true });
problemSchema.index({ difficulty: 1 });
problemSchema.index({ category: 1, difficulty: 1 });

export const Problem = mongoose.model<IProblem>("Problem", problemSchema);
