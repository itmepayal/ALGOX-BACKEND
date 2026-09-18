import { Document, Types, Schema, model } from "mongoose";

export type SubmissionStatus =
  | "PENDING"
  | "RUNNING"
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILATION_ERROR";

export type ProgrammingLanguage = "python" | "javascript" | "cpp" | "java";

/** Run attempts are persisted for "Attempted" progress; only submit ACCEPTED counts as Solved. */
export type SubmissionSource = "run" | "submit";

export interface ISubmission extends Document {
  userId?: Types.ObjectId;
  problemId: Types.ObjectId;
  contestId?: Types.ObjectId;
  mockInterviewSessionId?: Types.ObjectId;
  virtualContestSessionId?: Types.ObjectId;

  language: ProgrammingLanguage;
  code: string;

  status: SubmissionStatus;
  /** Defaults to submit for legacy rows. */
  source?: SubmissionSource;

  output?: string;
  error?: string;

  executionTime?: number;
  memory?: number;

  testCasesPassed?: number;
  totalTestCases?: number;

  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<ISubmission>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
    contestId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    mockInterviewSessionId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    virtualContestSessionId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    language: {
      type: String,
      enum: ["python", "javascript", "cpp", "java"],
      required: true,
      lowercase: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ["run", "submit"],
      default: "submit",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "RUNNING",
        "ACCEPTED",
        "WRONG_ANSWER",
        "TIME_LIMIT_EXCEEDED",
        "MEMORY_LIMIT_EXCEEDED",
        "RUNTIME_ERROR",
        "COMPILATION_ERROR",
      ],
      default: "PENDING",
      index: true,
    },
    output: String,
    error: String,

    executionTime: Number,
    memory: Number,

    testCasesPassed: Number,
    totalTestCases: Number,
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

submissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });
submissionSchema.index({ userId: 1, createdAt: -1 });
submissionSchema.index({ problemId: 1, createdAt: -1 });
submissionSchema.index({ createdAt: -1 });
submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ language: 1, createdAt: -1 });
submissionSchema.index({ status: 1, source: 1, createdAt: -1 });

export const Submission = model<ISubmission>("Submission", submissionSchema);
