import { Document, Schema, Types, model } from "mongoose";

export interface ISubmissionDoc extends Document {
  userId?: Types.ObjectId;
  problemId: Types.ObjectId;
  code: string;
  language: string;
  status: string;
  source?: string;
  output?: string;
  error?: string;
  executionTime?: number;
  memory?: number;
  testCasesPassed?: number;
  totalTestCases?: number;
  createdAt: Date;
  updatedAt: Date;
}

const submissionDocSchema = new Schema<ISubmissionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
    code: { type: String, required: true },
    language: { type: String, required: true },
    status: { type: String, required: true },
    source: { type: String },
    output: String,
    error: String,
    executionTime: Number,
    memory: Number,
    testCasesPassed: Number,
    totalTestCases: Number,
  },
  { timestamps: true }
);

export const SubmissionDoc = model<ISubmissionDoc>("SubmissionDoc", submissionDocSchema, "submissions");
