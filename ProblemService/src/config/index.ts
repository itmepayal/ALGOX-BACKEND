import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  JWT_SECRET: string;
  SUBMISSION_SERVICE_URL: string;
  AUTH_SERVICE_URL: string;
  /**
   * Shared secret for service-to-service calls (hidden testcases, contest checks).
   * Production: set INTERNAL_SERVICE_SECRET. Dev default keeps local workers working.
   */
  INTERNAL_SERVICE_SECRET: string;
  NODE_ENV: string;
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
    throw new Error(
      "INTERNAL_SERVICE_SECRET is required in production (protects /problems/internal)"
    );
  }
  return "dev-internal-service-secret";
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3003,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  SUBMISSION_SERVICE_URL: getEnvVariable(
    "SUBMISSION_SERVICE_URL",
    "http://localhost:3004"
  ),
  AUTH_SERVICE_URL: getEnvVariable(
    "AUTH_SERVICE_URL",
    "http://localhost:3001"
  ),
  INTERNAL_SERVICE_SECRET: resolveInternalSecret(),
  NODE_ENV: process.env.NODE_ENV || "development",
};
