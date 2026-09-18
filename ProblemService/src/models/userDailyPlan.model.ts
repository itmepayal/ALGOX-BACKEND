import mongoose, { Document, Schema } from "mongoose";

export type PlannerTaskType = "problem" | "revision" | "session" | "custom";

export interface IPlannerTask {
  id: string;
  type: PlannerTaskType;
  title: string;
  problemId?: string;
  problemSlug?: string;
  completed: boolean;
  completedSource?: "manual" | "submission";
  createdAt: number;
}

export interface IUserDailyPlan extends Document {
  userId: string;
  date: string; // YYYY-MM-DD
  tasks: IPlannerTask[];
  notes?: string;
  updatedAtMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const plannerTaskSchema = new Schema<IPlannerTask>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["problem", "revision", "session", "custom"],
      required: true,
    },
    title: { type: String, required: true, maxlength: 300 },
    problemId: { type: String },
    problemSlug: { type: String },
    completed: { type: Boolean, default: false },
    completedSource: {
      type: String,
      enum: ["manual", "submission"],
    },
    createdAt: { type: Number, required: true },
  },
  { _id: false }
);

const userDailyPlanSchema = new Schema<IUserDailyPlan>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    tasks: { type: [plannerTaskSchema], default: [] },
    notes: { type: String, maxlength: 2000 },
    updatedAtMs: { type: Number, default: () => Date.now() },
  },
  { timestamps: true }
);

userDailyPlanSchema.index({ userId: 1, date: 1 }, { unique: true });

export const UserDailyPlan = mongoose.model<IUserDailyPlan>(
  "UserDailyPlan",
  userDailyPlanSchema
);
