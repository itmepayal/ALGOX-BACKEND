import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  JWT_SECRET: string;
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
  PORT: Number(process.env.PORT) || 3003,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  JWT_SECRET: getEnvVariable("JWT_SECRET", "super_secret_jwt_access_key"),
};
