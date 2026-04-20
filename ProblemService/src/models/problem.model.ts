import mongoose, { Document, Schema } from "mongoose";

export interface ITestcase {
  input: string;
  output: string;
  isHidden?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProblem extends Document {
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  editorial?: string;
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

const problemSchema = new Schema<IProblem>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
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
    },
    editorial: {
      type: String,
    },
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

export const Problem = mongoose.model("Problem", problemSchema);
