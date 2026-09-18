/**
 * Align Problem.isPremium denormalized flags with FREE Learning Sheet membership.
 * Runtime access uses sheet membership; this keeps admin filters/list UI consistent.
 *
 * Run: cd server/ProblemService && npx tsx scripts/sync-sheet-free-premium.ts
 */
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const mongo = process.env.MONGO_URL;
  if (!mongo) throw new Error("MONGO_URL required");
  await mongoose.connect(mongo);

  const db = mongoose.connection.db!;
  const sheets = db.collection("sheets");
  const sheetProblems = db.collection("sheetproblems");
  const problems = db.collection("problems");

  // Backfill missing access field → FREE
  const backfill = await sheets.updateMany(
    { access: { $exists: false } },
    { $set: { access: "FREE" } }
  );
  console.log("sheets.access backfill", backfill.modifiedCount);

  const freeSheets = await sheets
    .find({ status: "PUBLISHED", access: { $ne: "PREMIUM" } })
    .project({ sheetId: 1 })
    .toArray();
  const sheetIds = freeSheets.map((s) => String(s.sheetId));
  console.log("FREE published sheets", sheetIds.length, sheetIds);

  const freeLinks = sheetIds.length
    ? await sheetProblems
        .find({ sheetId: { $in: sheetIds } })
        .project({ problem: 1 })
        .toArray()
    : [];
  const freeIds = [
    ...new Set(freeLinks.map((l) => l.problem).filter(Boolean)),
  ];
  console.log("FREE sheet problem ids", freeIds.length);

  if (freeIds.length) {
    const freeUpdate = await problems.updateMany(
      { _id: { $in: freeIds } },
      { $set: { isPremium: false } }
    );
    console.log("marked FREE (isPremium=false)", freeUpdate.modifiedCount);

    const premUpdate = await problems.updateMany(
      { _id: { $nin: freeIds }, status: { $in: ["published", "draft", "archived"] } },
      { $set: { isPremium: true } }
    );
    console.log("marked PREMIUM (isPremium=true)", premUpdate.modifiedCount);
  } else {
    const premUpdate = await problems.updateMany(
      {},
      { $set: { isPremium: true } }
    );
    console.log(
      "no FREE sheet links — marked all problems PREMIUM",
      premUpdate.modifiedCount
    );
  }

  await mongoose.disconnect();
  console.log("DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
