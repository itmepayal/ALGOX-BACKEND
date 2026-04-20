import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  PROBLEM_SERVICE: string;
};

function loadEnv() {
  dotenv.config();
  console.log("Environment variables loaded");
}

loadEnv();

function getEnvVariable(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3001,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: getEnvVariable("REDIS_URL"),
  REDIS_TOKEN: getEnvVariable("REDIS_TOKEN"),
  PROBLEM_SERVICE: getEnvVariable("PROBLEM_SERVICE"),
};
