import dotenv from "dotenv";
dotenv.config();

export const serverConfig = {
  PORT: process.env.PORT || 3008,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/leetcode_discussion",
  REDIS_URL: process.env.REDIS_URL || "",
  REDIS_TOKEN: process.env.REDIS_TOKEN || "",
  NODE_ENV: process.env.NODE_ENV || "development",
};
