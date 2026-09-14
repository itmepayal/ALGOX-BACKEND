import mongoose, { Document, Schema } from "mongoose";

export interface IRankingAudit extends Document {
  actorId: string;
  actorEmail?: string;
  action: string;
  userId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const rankingAuditSchema = new Schema<IRankingAudit>(
  {
    actorId: { type: String, required: true, index: true },
    actorEmail: { type: String },
    action: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    note: { type: String },
  },
  { timestamps: true }
);

export const RankingAudit = mongoose.model<IRankingAudit>(
  "RankingAudit",
  rankingAuditSchema
);
