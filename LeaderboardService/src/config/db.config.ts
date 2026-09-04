import mongoose from "mongoose";
import { serverConfig } from ".";
import logger from "./logger.config";

export const connectDB = async () => {
  try {
    await mongoose.connect(serverConfig.MONGO_URL);
    logger.info("Connected to MongoDB database");
  } catch (error) {
    logger.error("Failed to connect to MongoDB", error);
    process.exit(1);
  }
};
