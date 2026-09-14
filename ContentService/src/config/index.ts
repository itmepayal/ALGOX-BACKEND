import dotenv from "dotenv";
dotenv.config();

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

export const serverConfig = {
  PORT: process.env.PORT || 3009,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/leetcode_content",
  REDIS_URL: process.env.REDIS_URL || "",
  REDIS_TOKEN: process.env.REDIS_TOKEN || "",
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  INTERNAL_SERVICE_SECRET: (() => {
    const fromEnv =
      process.env.INTERNAL_SERVICE_SECRET ||
      process.env.INTERNAL_REALTIME_SECRET ||
      "";
    if (fromEnv) return fromEnv;
    if (isProduction()) {
      throw new Error("INTERNAL_SERVICE_SECRET is required in production");
    }
    return "dev-internal-service-secret";
  })(),
};
