import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
};

function loadEnv() {
  dotenv.config();
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
  REDIS_URL: getEnvVariable("REDIS_URL"),
  REDIS_TOKEN: getEnvVariable("REDIS_TOKEN"),
};
