import dotenv from "dotenv";
dotenv.config();

export const serverConfig = {
  PORT: process.env.PORT || 3007,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/leetcode_analytics",
  REDIS_URL: process.env.REDIS_URL || "",
  REDIS_TOKEN: process.env.REDIS_TOKEN || "",
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "super_secret_jwt_access_key",
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  PROBLEM_SERVICE_URL: process.env.PROBLEM_SERVICE_URL || "http://localhost:3003",
  SUBMISSION_SERVICE_URL:
    process.env.SUBMISSION_SERVICE_URL || "http://localhost:3004",
};
