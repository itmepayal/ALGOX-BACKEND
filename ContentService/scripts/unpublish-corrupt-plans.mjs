/**
 * One-shot: unpublish study plans whose title is accidental UI-chrome spam
 * (e.g. "Create article" repeated). Does not invent replacement titles.
 *
 * Run: cd server/ContentService && node scripts/unpublish-corrupt-plans.mjs
 */
import mongoose from "mongoose";

const uri = process.env.MONGO_URI || "mongodb://localhost:27017/leetcode_content";

function isChromeSpamTitle(title) {
  const t = String(title || "").trim();
  if (!t) return false;
  const labels = ["Create article", "Create study plan", "Save", "Submit", "Publish"];
  for (const label of labels) {
    if (t === label) return true;
    // Exact phrase repeated with no separator, 3+ times
    if (t.length % label.length === 0) {
      const reps = t.length / label.length;
      if (reps >= 3 && label.repeat(reps) === t) return true;
    }
  }
  return false;
}

const conn = await mongoose.connect(uri);
const col = conn.connection.db.collection("studyplans");
const published = await col.find({ isPublished: true }).toArray();
let n = 0;
for (const doc of published) {
  if (!isChromeSpamTitle(doc.title)) continue;
  await col.updateOne(
    { _id: doc._id },
    { $set: { isPublished: false }, $currentDate: { updatedAt: true } }
  );
  console.log("unpublished", String(doc._id), "slug=", doc.slug);
  n += 1;
}
console.log("done", { scanned: published.length, unpublished: n });
await mongoose.disconnect();
