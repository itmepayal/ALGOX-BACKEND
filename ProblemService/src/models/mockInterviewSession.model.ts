import mongoose, { Document, Schema } from "mongoose";

export type MockInterviewStatus =
  | "in_progress"
  | "timed_out"
  | "completed"
  | "abandoned";

export type MockInterviewDifficulty = "easy" | "medium" | "hard" | "mixed";

export interface IMockInterviewConfig {
  company?: string;
  role?: string;
  difficulty: MockInterviewDifficulty;
  durationMinutes: number;
  language: "python" | "javascript" | "cpp" | "java";
  topics: string[];
  problemCount: number;
}

export interface IMockInterviewProblemAttempt {
  problemId: string;
  problemSlug?: string;
  title?: string;
  difficulty?: string;
  order: number;
  submissionId?: string;
  status?: string;
  testCasesPassed?: number;
  totalTestCases?: number;
  executionTimeMs?: number;
  memoryMb?: number;
  language?: string;
  submittedAt?: Date;
  /** Real signal: source must be submit (never run). */
  source?: string;
}

/** Score cell — never invent values; mark unavailable when no signal exists. */
export interface IMockScoreCell {
  score: number | null;
  available: boolean;
  signal: string;
  detail?: string;
}

export interface IMockInterviewReport {
  generatedAt: Date;
  sessionStatus: MockInterviewStatus;
  durationMinutes: number;
  timeUsedMs: number;
  remainingMsAtEnd: number;
  completedBeforeTimeout: boolean;
  problemsTotal: number;
  problemsAttempted: number;
  problemsAccepted: number;
  scores: {
    problemSolving: IMockScoreCell;
    correctness: IMockScoreCell;
    complexity: IMockScoreCell;
    timeManagement: IMockScoreCell;
    codeQuality: IMockScoreCell;
    performance: IMockScoreCell;
    completion: IMockScoreCell;
  };
  attempts: IMockInterviewProblemAttempt[];
}

export interface IMockInterviewSession extends Document {
  userId: string;
  config: IMockInterviewConfig;
  status: MockInterviewStatus;
  problemIds: string[];
  attempts: IMockInterviewProblemAttempt[];
  startedAt: Date;
  endsAt: Date;
  completedAt?: Date;
  report?: IMockInterviewReport;
  createdAt: Date;
  updatedAt: Date;
}

const configSchema = new Schema<IMockInterviewConfig>(
  {
    company: { type: String, trim: true },
    role: { type: String, trim: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "mixed"],
      default: "medium",
    },
    durationMinutes: { type: Number, required: true, min: 10, max: 180 },
    language: {
      type: String,
      enum: ["python", "javascript", "cpp", "java"],
      required: true,
    },
    topics: { type: [String], default: [] },
    problemCount: { type: Number, default: 1, min: 1, max: 5 },
  },
  { _id: false }
);

const attemptSchema = new Schema<IMockInterviewProblemAttempt>(
  {
    problemId: { type: String, required: true },
    problemSlug: { type: String },
    title: { type: String },
    difficulty: { type: String },
    order: { type: Number, required: true },
    submissionId: { type: String },
    status: { type: String },
    testCasesPassed: { type: Number },
    totalTestCases: { type: Number },
    executionTimeMs: { type: Number },
    memoryMb: { type: Number },
    language: { type: String },
    submittedAt: { type: Date },
    source: { type: String },
  },
  { _id: false }
);

const scoreCellSchema = new Schema<IMockScoreCell>(
  {
    score: { type: Number, default: null },
    available: { type: Boolean, required: true },
    signal: { type: String, required: true },
    detail: { type: String },
  },
  { _id: false }
);

const reportSchema = new Schema<IMockInterviewReport>(
  {
    generatedAt: { type: Date, required: true },
    sessionStatus: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    timeUsedMs: { type: Number, required: true },
    remainingMsAtEnd: { type: Number, required: true },
    completedBeforeTimeout: { type: Boolean, required: true },
    problemsTotal: { type: Number, required: true },
    problemsAttempted: { type: Number, required: true },
    problemsAccepted: { type: Number, required: true },
    scores: {
      problemSolving: { type: scoreCellSchema, required: true },
      correctness: { type: scoreCellSchema, required: true },
      complexity: { type: scoreCellSchema, required: true },
      timeManagement: { type: scoreCellSchema, required: true },
      codeQuality: { type: scoreCellSchema, required: true },
      performance: { type: scoreCellSchema, required: true },
      completion: { type: scoreCellSchema, required: true },
    },
    attempts: { type: [attemptSchema], default: [] },
  },
  { _id: false }
);

const mockInterviewSessionSchema = new Schema<IMockInterviewSession>(
  {
    userId: { type: String, required: true, index: true },
    config: { type: configSchema, required: true },
    status: {
      type: String,
      enum: ["in_progress", "timed_out", "completed", "abandoned"],
      default: "in_progress",
      index: true,
    },
    problemIds: { type: [String], required: true },
    attempts: { type: [attemptSchema], default: [] },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true, index: true },
    completedAt: { type: Date },
    report: { type: reportSchema },
  },
  { timestamps: true }
);

/** At most one in-progress session per user (duplicate-session prevention). */
mockInterviewSessionSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "in_progress" },
  }
);

export const MockInterviewSession = mongoose.model<IMockInterviewSession>(
  "MockInterviewSession",
  mockInterviewSessionSchema
);
