import { Document, Types, Schema, model } from "mongoose";

export type SubmissionStatus =
  | "PENDING"
  | "RUNNING"
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILATION_ERROR";

export type ProgrammingLanguage = "python" | "javascript" | "cpp" | "java";

export interface ISubmission extends Document {
  problemId: Types.ObjectId;

  language: ProgrammingLanguage;
  code: string;

  status: SubmissionStatus;

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
    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
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
    status: {
      type: String,
      enum: [
        "PENDING",
        "RUNNING",
        "ACCEPTED",
        "WRONG_ANSWER",
        "TIME_LIMIT_EXCEEDED",
        "RUNTIME_ERROR",
        "COMPILATION_ERROR",
      ],
      default: "PENDING",
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

submissionSchema.index({ problemId: 1, createdAt: -1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ language: 1 });
submissionSchema.index({
  code: "text",
  language: "text",
  status: "text",
});

export const Submission = model<ISubmission>("Submission", submissionSchema);
