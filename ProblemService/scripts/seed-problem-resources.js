/**
 * Attach demo resources to Maximum Subarray (and any problem missing resources).
 * Safe to re-run. Does not touch secrets.
 *
 * Usage: node scripts/seed-problem-resources.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL missing");
  await mongoose.connect(url);
  const col = mongoose.connection.db.collection("problems");

  const resources = [
    {
      type: "youtube",
      url: "https://www.youtube.com/watch?v=5WZl3MMT0Ek",
      label: "Kadane's Algorithm",
      isPremium: false,
    },
    {
      type: "article",
      url: "https://en.wikipedia.org/wiki/Maximum_subarray_problem",
      label: "Wikipedia",
      isPremium: false,
    },
    {
      type: "docs",
      url: "https://leetcode.com/problems/maximum-subarray/",
      label: "Reference",
      isPremium: false,
      // kept free for demo
    },
  ];

  const r = await col.updateOne(
    { slug: "maximum-subarray" },
    {
      $set: {
        resources,
        videoUrl: resources[0].url,
        articleUrl: resources[1].url,
        practiceUrl: "https://leetcode.com/problems/maximum-subarray/",
        editorial:
          "Use Kadane's algorithm: track current and global maximum ending here.\n\nHint 1: At each index, either extend the previous subarray or start fresh.\nHint 2: Keep a running sum and reset when it becomes negative.",
      },
    }
  );

  console.log("maximum-subarray matched:", r.matchedCount, "modified:", r.modifiedCount);

  // Light resources for other array problems if present
  const extras = [
    {
      slug: "two-sum",
      resources: [
        {
          type: "youtube",
          url: "https://www.youtube.com/watch?v=KLlXCFG5TnA",
          label: "Two Sum",
        },
        {
          type: "article",
          url: "https://leetcode.com/problems/two-sum/",
          label: "Article",
        },
      ],
      practiceUrl: "https://leetcode.com/problems/two-sum/",
    },
  ];

  for (const e of extras) {
    const ur = await col.updateOne(
      { slug: e.slug, $or: [{ resources: { $exists: false } }, { resources: { $size: 0 } }] },
      {
        $set: {
          resources: e.resources,
          videoUrl: e.resources.find((x) => x.type === "youtube")?.url,
          articleUrl: e.resources.find((x) => x.type === "article")?.url,
          practiceUrl: e.practiceUrl,
        },
      }
    );
    console.log(e.slug, "matched", ur.matchedCount, "modified", ur.modifiedCount);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
