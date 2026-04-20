import { Redis } from "@upstash/redis";
import { serverConfig } from "../config/index";

const redis = new Redis({
  url: serverConfig.REDIS_URL,
  token: serverConfig.REDIS_TOKEN,
});

export default redis;
