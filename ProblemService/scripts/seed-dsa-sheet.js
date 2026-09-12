/**
 * Seed the full NeetCode + Striver A2Z style DSA sheet into ProblemService.
 *
 * - Upserts ~192 unique problems across 20 topics
 * - Preserves richer judge configs for already-seeded "core" problems when present
 * - Sheet UI lists problems topic-wise (cross-listed titles appear under multiple topics)
 *
 * Run from ProblemService:
 *   node scripts/seed-dsa-sheet.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const sheetPath = path.join(__dirname, "data", "dsa-best-sheet.json");
const sheet = JSON.parse(fs.readFileSync(sheetPath, "utf8"));

const CORE_SLUGS = new Set([
  "two-sum",
  "maximum-subarray",
  "contains-duplicate",
  "reverse-an-array",
  "find-maximum-element",
]);

function stubs(starter) {
  return [
    { language: "cpp", startSnippet: "", userTemplate: starter.cpp },
    { language: "python", startSnippet: "", userTemplate: starter.python },
    { language: "javascript", startSnippet: "", userTemplate: starter.javascript },
  ];
}

function genericStarter(title) {
  const safe = title.replace(/[^a-zA-Z0-9]/g, "") || "solve";
  const fn = safe.charAt(0).toLowerCase() + safe.slice(1);
  return {
    javascript: `function ${fn}(/* args */) {\n    // TODO: implement ${title}\n}\n`,
    python: `class Solution:\n    def ${fn}(self, *args):\n        # TODO: implement ${title}\n        pass\n`,
    cpp: `class Solution {\npublic:\n    // TODO: implement ${title}\n    int solve() {\n        return 0;\n    }\n};\n`,
  };
}

function leetcodeSearchUrl(title) {
  const q = encodeURIComponent(title);
  return `https://leetcode.com/problemset/?search=${q}`;
}

function buildProblemDoc(entry) {
  const starter = genericStarter(entry.title);
  const topics = entry.topics || [entry.category];
  return {
    title: entry.title,
    slug: entry.slug,
    difficulty: entry.difficulty,
    category: entry.category,
    tags: Array.from(new Set([entry.category, ...topics])),
    description: `${entry.title}

This problem is part of the **DSA Best Questions** sheet (NeetCode + Striver A2Z style).

**Topic:** ${entry.category}
**Also listed under:** ${topics.join(", ")}

Open the practice link for the full statement on LeetCode, or implement your solution here once a full judge harness is available for this problem.`,
    constraints: "See problem statement on the practice platform.",
    functionName: "solve",
    className: "Solution",
    starterCode: starter,
    codeStubs: stubs(starter),
    examples: [],
    testcases: [
      {
        input: { value: 0 },
        output: "0",
        expectedOutput: "0",
        isHidden: false,
        order: 1,
      },
    ],
    resources: [
      {
        type: "practice",
        url: leetcodeSearchUrl(entry.title),
        label: "Practice on LeetCode",
        isPremium: false,
      },
    ],
    practiceUrl: leetcodeSearchUrl(entry.title),
    timeLimitMs: 2000,
    memoryLimitMb: 256,
  };
}

async function main() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL missing in ProblemService .env");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;
  const col = db.collection("problems");

  console.log("Connected. Seeding DSA Best Sheet…");
  console.log(sheet.stats);

  // Load existing core problems so we don't wipe judge configs
  const existingCore = await col
    .find({ slug: { $in: Array.from(CORE_SLUGS) } })
    .toArray();
  const coreBySlug = new Map(existingCore.map((p) => [p.slug, p]));

  const unique = sheet.uniqueProblems;
  const ops = [];

  for (const entry of unique) {
    const doc = buildProblemDoc(entry);
    const core = coreBySlug.get(entry.slug);
    if (core) {
      // Keep full judge payload; only refresh taxonomy / resources
      ops.push({
        updateOne: {
          filter: { slug: entry.slug },
          update: {
            $set: {
              category: entry.category,
              tags: Array.from(
                new Set([
                  ...(core.tags || []),
                  entry.category,
                  ...(entry.topics || []),
                ])
              ),
              practiceUrl: core.practiceUrl || doc.practiceUrl,
              resources:
                core.resources && core.resources.length
                  ? core.resources
                  : doc.resources,
              updatedAt: new Date(),
            },
          },
        },
      });
    } else {
      ops.push({
        updateOne: {
          filter: { slug: entry.slug },
          update: {
            $set: { ...doc, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      });
    }
  }

  // Remove problems that are NOT in the sheet and NOT core reverse/find-max
  // Keep reverse-an-array / find-maximum-element even if not in NeetCode list
  const keepSlugs = new Set(unique.map((p) => p.slug));
  for (const s of CORE_SLUGS) keepSlugs.add(s);

  const deleteResult = await col.deleteMany({
    slug: { $nin: Array.from(keepSlugs) },
  });

  if (ops.length) {
    const result = await col.bulkWrite(ops, { ordered: false });
    console.log("Upserted/updated:", {
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount,
    });
  }

  console.log("Deleted outdated problems:", deleteResult.deletedCount);
  const total = await col.countDocuments();
  console.log("Problems in DB now:", total);
  console.log("Done.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
