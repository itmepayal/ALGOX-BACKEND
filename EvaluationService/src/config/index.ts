import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  PROBLEM_SERVICE: string;
  SUBMISSION_SERVICE: string;
  ANALYTICS_SERVICE: string;
  LEADERBOARD_SERVICE: string;
  AUTH_SERVICE_URL: string;
  JWT_SECRET: string;
  INTERNAL_SERVICE_SECRET: string;
};

function loadEnv() {
  dotenv.config();
  console.log("Environment variables loaded");
}

loadEnv();

function isProduction(): boolean {
  return (process.env.NODE_ENV || "development") === "production";
}

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Dev-only defaults; production must set the env var. Never log the value. */
function secretEnv(key: string, devDefault: string): string {
  const value = process.env[key];
  if (value) return value;
  if (isProduction()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return devDefault;
}

function resolveInternalSecret(): string {
  const fromEnv =
    process.env.INTERNAL_SERVICE_SECRET ||
    process.env.INTERNAL_REALTIME_SECRET ||
    "";
  if (fromEnv) return fromEnv;
  if (isProduction()) {
    throw new Error("INTERNAL_SERVICE_SECRET is required in production");
  }
  return "dev-internal-service-secret";
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3006,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: getEnvVariable("REDIS_URL"),
  REDIS_TOKEN: process.env.REDIS_TOKEN || "",
  PROBLEM_SERVICE: getEnvVariable("PROBLEM_SERVICE"),
  SUBMISSION_SERVICE: getEnvVariable("SUBMISSION_SERVICE"),
  ANALYTICS_SERVICE:
    process.env.ANALYTICS_SERVICE || "http://localhost:3007/api/v1",
  LEADERBOARD_SERVICE:
    process.env.LEADERBOARD_SERVICE || "http://localhost:3005/api/v1",
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  INTERNAL_SERVICE_SECRET: resolveInternalSecret(),
};
