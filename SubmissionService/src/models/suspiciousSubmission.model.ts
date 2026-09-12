import { Document, Types, Schema, model } from "mongoose";

/**
 * Heuristic-only fraud signals. NEVER auto-ban — admin review only.
 *
 * Severity bands (from score 0–100):
 *   NORMAL     0–29   (not persisted — noise)
 *   REVIEW    30–59
 *   HIGH_RISK 60–79
 *   CRITICAL  80–100
 */
export type SuspiciousSeverity = "NORMAL" | "REVIEW" | "HIGH_RISK" | "CRITICAL";

export type SuspiciousStatus =
  | "FLAGGED"
  | "REVIEWING"
  | "CONFIRMED"
  | "DISMISSED";

export interface ISuspiciousSubmission extends Document {
  userId: Types.ObjectId;
  submissionId: Types.ObjectId;
  signals: string[];
  score: number;
  severity: SuspiciousSeverity;
  status: SuspiciousStatus;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function severityFromScore(score: number): SuspiciousSeverity {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 80) return "CRITICAL";
  if (s >= 60) return "HIGH_RISK";
  if (s >= 30) return "REVIEW";
  return "NORMAL";
}

const suspiciousSubmissionSchema = new Schema<ISuspiciousSubmission>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
      index: true,
    },
    signals: {
      type: [String],
      default: [],
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    severity: {
      type: String,
      enum: ["NORMAL", "REVIEW", "HIGH_RISK", "CRITICAL"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["FLAGGED", "REVIEWING", "CONFIRMED", "DISMISSED"],
      default: "FLAGGED",
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    resolution: {
      type: String,
      default: "",
    },
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
  }
);

suspiciousSubmissionSchema.index({ status: 1, severity: 1, createdAt: -1 });
suspiciousSubmissionSchema.index({ userId: 1, createdAt: -1 });
/** One open flag per submission (FLAGGED / REVIEWING). */
suspiciousSubmissionSchema.index(
  { submissionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["FLAGGED", "REVIEWING"] },
    },
  }
);

export const SuspiciousSubmission = model<ISuspiciousSubmission>(
  "SuspiciousSubmission",
  suspiciousSubmissionSchema
);
