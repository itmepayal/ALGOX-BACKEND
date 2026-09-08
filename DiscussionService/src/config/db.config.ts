import mongoose from "mongoose";
import { serverConfig } from "./index";

export const connectDB = async () => {
  try {
    await mongoose.connect(serverConfig.MONGO_URI);
    console.log("Connected to MongoDB for DiscussionService");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    process.exit(1);
  }
};
