import dotenv from "dotenv";

type ServerConfig = {
  /** Documented production default: 3010 */
  PORT: number;
  JWT_SECRET: string;
  /** Optional — broadcast logs. Empty string disables Mongo. */
  MONGO_URL: string;
  /** Optional — Redis for Socket.IO adapter. Empty disables. */
  REDIS_URL: string;
  AUTH_SERVICE_URL: string;
  CORS_ORIGIN: string[];
  EVENT_BUFFER_SIZE: number;
  IDLE_TIMEOUT_MS: number;
  INTERNAL_SECRET: string;
};

function loadEnv() {
  dotenv.config();
}

loadEnv();

function optionalEnv(key: string, defaultValue = ""): string {
  return process.env[key] ?? defaultValue;
}

function isProduction(): boolean {
  return (process.env.NODE_ENV || "development") === "production";
}

function secretEnv(key: string, devDefault: string): string {
  const value = process.env[key];
  if (value) return value;
  if (isProduction()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return devDefault;
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3010,
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  MONGO_URL: optionalEnv("MONGO_URL"),
  REDIS_URL: optionalEnv("REDIS_URL"),
  AUTH_SERVICE_URL: optionalEnv(
    "AUTH_SERVICE_URL",
    "http://localhost:3001/api/v1"
  ),
  CORS_ORIGIN: optionalEnv("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  EVENT_BUFFER_SIZE: Number(process.env.EVENT_BUFFER_SIZE) || 500,
  IDLE_TIMEOUT_MS: Number(process.env.IDLE_TIMEOUT_MS) || 120_000,
  INTERNAL_SECRET: (() => {
    const fromEnv =
      process.env.INTERNAL_SERVICE_SECRET ||
      process.env.INTERNAL_REALTIME_SECRET ||
      "";
    if (fromEnv) return fromEnv;
    if (isProduction()) {
      throw new Error(
        "INTERNAL_SERVICE_SECRET (or INTERNAL_REALTIME_SECRET) is required in production"
      );
    }
    return "dev-internal-service-secret";
  })(),
};
