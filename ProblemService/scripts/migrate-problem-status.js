/**
 * Migrate existing problems: missing/null status → published.
 *
 * From ProblemService:
 *   node scripts/migrate-problem-status.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URL required");
  await mongoose.connect(uri);
  const col = mongoose.connection.collection("problems");

  const result = await col.updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }] },
    {
      $set: {
        status: "published",
        publishedAt: new Date(),
      },
    }
  );

  console.log(
    `Migrated ${result.modifiedCount} problems to status=published (matched ${result.matchedCount})`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
