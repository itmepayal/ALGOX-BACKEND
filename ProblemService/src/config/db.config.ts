import mongoose from "mongoose";
import logger from "./logger.config";
import { serverConfig } from "./index";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(serverConfig.MONGO_URL, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    if (mongoose.connection.listenerCount("error") === 0) {
      mongoose.connection.on("error", (err) => {
        logger.error(`MongoDB Error: ${err.message}`);
      });

      mongoose.connection.on("disconnected", () => {
        logger.warn("MongoDB Disconnected");
      });

      mongoose.connection.on("reconnected", () => {
        logger.info("MongoDB Reconnected");
      });
    }
  } catch (error) {
    logger.error(`MongoDB Connection Failed: ${error}`);
    process.exit(1);
  }
};

process.once("SIGINT", async () => {
  await mongoose.connection.close();
  logger.info("MongoDB Connection Closed due to app termination");
  process.exit(0);
});
