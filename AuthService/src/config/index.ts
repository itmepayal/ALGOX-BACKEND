import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  PROBLEM_SERVICE: string;
  SUBMISSION_SERVICE: string;
  JWT_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
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
function secretEnv(key: string, devDefault?: string): string {
  const value = process.env[key];
  if (value) return value;
  if (isProduction() || devDefault === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return devDefault;
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3000,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: getEnvVariable("REDIS_URL"),
  REDIS_TOKEN: getEnvVariable("REDIS_TOKEN"),
  PROBLEM_SERVICE: getEnvVariable("PROBLEM_SERVICE"),
  SUBMISSION_SERVICE: getEnvVariable("SUBMISSION_SERVICE"),
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  REFRESH_TOKEN_SECRET: secretEnv(
    "REFRESH_TOKEN_SECRET",
    "super_secret_jwt_refresh_key"
  ),
  // Cloudinary: no hardcoded credentials — always required from env.
  CLOUDINARY_CLOUD_NAME: getEnvVariable("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: getEnvVariable("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: getEnvVariable("CLOUDINARY_API_SECRET"),
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
