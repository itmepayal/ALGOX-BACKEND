import mongoose from "mongoose";
import { serverConfig } from ".";
import logger from "./logger.config";

let mongoReady = false;

export function isMongoReady(): boolean {
  return mongoReady && mongoose.connection.readyState === 1;
}

/** Connect only when MONGO_URL is set; never block service start on failure. */
export async function connectDBOptional(): Promise<boolean> {
  if (!serverConfig.MONGO_URL) {
    logger.info("MONGO_URL unset — BroadcastLog persistence disabled");
    return false;
  }

  try {
    await mongoose.connect(serverConfig.MONGO_URL);
    mongoReady = true;
    logger.info("Connected to MongoDB (optional)");
    return true;
  } catch (error) {
    mongoReady = false;
    logger.warn("MongoDB unavailable — using in-memory broadcast logs", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
