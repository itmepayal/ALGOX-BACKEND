import { Redis } from "@upstash/redis";
import { serverConfig } from "../config/index";

// Prefer REST URL/token (AuthService-compatible). Fall back to REDIS_* if REST vars are absent.
const restUrl =
  process.env.UPSTASH_REDIS_REST_URL ||
  (serverConfig.REDIS_URL.startsWith("http") ? serverConfig.REDIS_URL : "");
const restToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || serverConfig.REDIS_TOKEN || "";

const redis = new Redis({
  url: restUrl,
  token: restToken,
});

export default redis;
