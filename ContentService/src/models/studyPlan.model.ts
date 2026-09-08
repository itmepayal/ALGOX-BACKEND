import { Schema, model, Document } from "mongoose";

export interface IStudyCard {
  title: string;
  description: string;
  problemIds: string[];
}

export interface IStudyPlan extends Document {
  title: string;
  slug: string;
  description: string;
  coverImage?: string;
  category: "interview" | "algorithm" | "data-structure" | "sql";
  cards: IStudyCard[];
  totalProblemsCount: number;
}

const studyPlanSchema = new Schema<IStudyPlan>(
  {
    title: { type: String, required: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    coverImage: { type: String },
    category: {
      type: String,
      enum: ["interview", "algorithm", "data-structure", "sql"],
      default: "interview",
      index: true,
    },
    cards: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        problemIds: [{ type: String }],
      },
    ],
    totalProblemsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const StudyPlan = model<IStudyPlan>("StudyPlan", studyPlanSchema);
