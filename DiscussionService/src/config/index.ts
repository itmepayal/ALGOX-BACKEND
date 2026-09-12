import dotenv from "dotenv";
dotenv.config();

export const serverConfig = {
  PORT: process.env.PORT || 3008,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/leetcode_discussion",
  REDIS_URL: process.env.REDIS_URL || "",
  REDIS_TOKEN: process.env.REDIS_TOKEN || "",
  JWT_SECRET: process.env.JWT_SECRET || "super_secret_jwt_access_key",
  NODE_ENV: process.env.NODE_ENV || "development",
};
