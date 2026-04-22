import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default redis;

export async function checkRedis() {
  try {
    console.log("🔌 Checking Redis connection...");

    // Set value
    await redis.set("health-check", "ok");
    console.log("✅ SET success");

    // Get value
    const value = await redis.get("health-check");
    console.log("📦 GET value:", value);

    if (value === "ok") {
      console.log("🎉 Redis is working perfectly!");
    } else {
      console.log("⚠️ Redis responded but value mismatch");
    }
  } catch (error: any) {
    console.error("❌ Redis connection failed:", error.message);
  }
}
