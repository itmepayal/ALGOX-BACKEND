import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
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
};
