import mongoose from "mongoose";
import { serverConfig } from ".";
import logger from "./logger.config";

let mongoReady = false;
let lastConnectError: string | null = null;
let connectAttempted = false;

export type BroadcastPersistenceStatus = {
  /** True only when mongoose is connected and usable for BroadcastLog writes. */
  mongoReady: boolean;
  /** Honest mode for clients / health. */
  mode: "mongo" | "memory";
  /** Why persistence is memory (or null when mongo). */
  reason: string | null;
  /** Last connect error message (no secrets). */
  lastError: string | null;
  /** Whether MONGO_URL was configured (non-empty). */
  mongoUrlConfigured: boolean;
};

export function isMongoReady(): boolean {
  return mongoReady && mongoose.connection.readyState === 1;
}

export function getBroadcastPersistenceStatus(): BroadcastPersistenceStatus {
  const configured = Boolean((serverConfig.MONGO_URL || "").trim());
  if (isMongoReady()) {
    return {
      mongoReady: true,
      mode: "mongo",
      reason: null,
      lastError: null,
      mongoUrlConfigured: true,
    };
  }
  let reason: string;
  if (!configured) {
    reason = "MONGO_URL unset — BroadcastLog persistence disabled";
  } else if (!connectAttempted) {
    reason = "MongoDB connect not attempted yet";
  } else if (lastConnectError) {
    reason = "MongoDB unavailable — BroadcastLog using in-memory only";
  } else {
    reason = "MongoDB not connected — BroadcastLog using in-memory only";
  }
  return {
    mongoReady: false,
    mode: "memory",
    reason,
    lastError: lastConnectError,
    mongoUrlConfigured: configured,
  };
}

function attachLifecycleListeners(): void {
  if (mongoose.connection.listenerCount("error") > 0) return;

  mongoose.connection.on("error", (err) => {
    mongoReady = false;
    lastConnectError = err instanceof Error ? err.message : String(err);
    logger.error(`MongoDB error: ${lastConnectError}`);
  });

  mongoose.connection.on("disconnected", () => {
    mongoReady = false;
    logger.warn(
      "MongoDB disconnected — BroadcastLog persistence degraded to memory"
    );
  });

  mongoose.connection.on("reconnected", () => {
    mongoReady = true;
    lastConnectError = null;
    logger.info("MongoDB reconnected — BroadcastLog persistence restored");
  });
}

/**
 * Connect only when MONGO_URL is set.
 * Never blocks service start on failure — WebSocket broadcasting always works.
 * Does not fake persistence: callers must check isMongoReady / getBroadcastPersistenceStatus.
 */
export async function connectDBOptional(): Promise<boolean> {
  connectAttempted = true;
  const url = (serverConfig.MONGO_URL || "").trim();

  if (!url) {
    mongoReady = false;
    lastConnectError = null;
    logger.info("MONGO_URL unset — BroadcastLog persistence disabled");
    return false;
  }

  try {
    await mongoose.connect(url, {
      autoIndex: true,
      serverSelectionTimeoutMS: 15_000,
      connectTimeoutMS: 12_000,
    });
    mongoReady = true;
    lastConnectError = null;
    attachLifecycleListeners();
    logger.info(
      `Connected to MongoDB for BroadcastLog (db=${mongoose.connection.name || "unknown"})`
    );
    return true;
  } catch (error) {
    mongoReady = false;
    lastConnectError =
      error instanceof Error ? error.message : String(error);
    logger.warn(
      "MongoDB unavailable — BroadcastLog persistence disabled (memory fallback only)",
      { error: lastConnectError }
    );
    return false;
  }
}
