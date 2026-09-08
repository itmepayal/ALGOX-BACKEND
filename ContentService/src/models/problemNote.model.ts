import { Schema, model, Document, Types } from "mongoose";

export interface IProblemNote extends Document {
  userId: Types.ObjectId;
  problemId: Types.ObjectId;
  noteText: string;
  tags: string[];
}

const problemNoteSchema = new Schema<IProblemNote>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
    noteText: { type: String, required: true },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

problemNoteSchema.index({ userId: 1, problemId: 1 }, { unique: true });

export const ProblemNote = model<IProblemNote>("ProblemNote", problemNoteSchema);
