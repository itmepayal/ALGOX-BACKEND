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
};

function loadEnv() {
  dotenv.config();
  console.log("Environment variables loaded");
}

loadEnv();

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3000,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: getEnvVariable("REDIS_URL"),
  REDIS_TOKEN: getEnvVariable("REDIS_TOKEN"),
  PROBLEM_SERVICE: getEnvVariable("PROBLEM_SERVICE"),
  SUBMISSION_SERVICE: getEnvVariable("SUBMISSION_SERVICE"),
  JWT_SECRET: getEnvVariable("JWT_SECRET", "super_secret_jwt_access_key"),
  REFRESH_TOKEN_SECRET: getEnvVariable("REFRESH_TOKEN_SECRET", "super_secret_jwt_refresh_key"),
  CLOUDINARY_CLOUD_NAME: getEnvVariable("CLOUDINARY_CLOUD_NAME", "doqb7czvi"),
  CLOUDINARY_API_KEY: getEnvVariable("CLOUDINARY_API_KEY", "163938951389993"),
  CLOUDINARY_API_SECRET: getEnvVariable("CLOUDINARY_API_SECRET", "BZTX2YPOKH70Nf1VtPhpPvhtgN4"),
};

