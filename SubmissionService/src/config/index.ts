import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  PROBLEM_SERVICE: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  JWT_SECRET: string;
  /** Base URL for AuthService (no trailing path). Used for admin audit writes. */
  AUTH_SERVICE_URL: string;
  /** Shared secret for Problem/Submission internal service calls. */
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
  PORT: Number(process.env.PORT) || 3004,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: getEnvVariable("REDIS_URL"),
  PROBLEM_SERVICE: getEnvVariable("PROBLEM_SERVICE"),
  UPSTASH_REDIS_REST_URL: getEnvVariable("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: getEnvVariable("UPSTASH_REDIS_REST_TOKEN"),
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  INTERNAL_SERVICE_SECRET: resolveInternalSecret(),
};
