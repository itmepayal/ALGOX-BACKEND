/**
 * Upsert one Array → Two Pointers problem (published).
 * Run from ProblemService: node scripts/seed-two-pointers-problem.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

function stubs(starter) {
  return [
    { language: "cpp", startSnippet: "", userTemplate: starter.cpp },
    { language: "python", startSnippet: "", userTemplate: starter.python },
    { language: "javascript", startSnippet: "", userTemplate: starter.javascript },
  ];
}

function tc(input, output, isHidden, order) {
  return {
    input,
    output: String(output),
    expectedOutput: String(output),
    isHidden: Boolean(isHidden),
    order,
    weight: 1,
  };
}

const problem = {
  title: "Two Sum II - Input Array Is Sorted",
  slug: "two-sum-ii-input-array-is-sorted",
  difficulty: "easy",
  status: "published",
  category: "Two Pointers",
  tags: ["Array", "Two Pointers", "Binary Search"],
  description: `Given a **1-indexed** array of integers \`numbers\` that is already **sorted in non-decreasing order**, find two numbers such that they add up to a specific \`target\` number.

Return the indices of the two numbers (\`index1\`, \`index2\`) as a 1-indexed array \`[index1, index2]\` of length 2.

Your solution must use only constant extra space.

### Example 1
Input: numbers = [2,7,11,15], target = 9  
Output: [1,2]  
Explanation: The sum of 2 and 7 is 9. Therefore index1 = 1, index2 = 2.

### Example 2
Input: numbers = [2,3,4], target = 6  
Output: [1,3]

### Example 3
Input: numbers = [-1,0], target = -1  
Output: [1,2]`,
  constraints: `• 2 ≤ numbers.length ≤ 3 * 10^4
• -1000 ≤ numbers[i] ≤ 1000
• numbers is sorted in non-decreasing order
• -1000 ≤ target ≤ 1000
• The tests are generated such that there is exactly one solution`,
  functionName: "twoSum",
  className: "Solution",
  publishedAt: new Date(),
  starterCode: {
    javascript: `function twoSum(numbers, target) {
  // return [index1, index2] (1-indexed)
}
`,
    python: `class Solution:
    def twoSum(self, numbers, target):
        # return [index1, index2] (1-indexed)
        pass
`,
    cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& numbers, int target) {
        // return {index1, index2} (1-indexed)
    }
};`,
  },
  examples: [
    {
      input: { numbers: [2, 7, 11, 15], target: 9 },
      output: "[1,2]",
      explanation: "2 + 7 = 9 → indices 1 and 2",
    },
    {
      input: { numbers: [2, 3, 4], target: 6 },
      output: "[1,3]",
    },
  ],
  testcases: [
    tc({ numbers: [2, 7, 11, 15], target: 9 }, "[1,2]", false, 1),
    tc({ numbers: [2, 3, 4], target: 6 }, "[1,3]", false, 2),
    tc({ numbers: [-1, 0], target: -1 }, "[1,2]", false, 3),
    tc({ numbers: [1, 2, 3, 4, 4, 9, 56, 90], target: 8 }, "[4,5]", true, 4),
    tc({ numbers: [5, 25, 75], target: 100 }, "[2,3]", true, 5),
  ],
  codeStubs: stubs({
    javascript: `function twoSum(numbers, target) {
  // Two pointers: left at start, right at end
}
`,
    python: `class Solution:
    def twoSum(self, numbers, target):
        # Two pointers: left at start, right at end
        pass
`,
    cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& numbers, int target) {
        // Two pointers: left at start, right at end
    }
};`,
  }),
  timeLimitMs: 2000,
  memoryLimitMb: 256,
};

async function main() {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URL required");
  await mongoose.connect(uri);
  const col = mongoose.connection.collection("problems");

  const result = await col.updateOne(
    { slug: problem.slug },
    { $set: problem },
    { upsert: true }
  );

  console.log(
    `Upserted "${problem.title}" (matched=${result.matchedCount}, upserted=${result.upsertedCount}, modified=${result.modifiedCount})`
  );

  // Ensure older problems without status show up as published
  const migrated = await col.updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }] },
    { $set: { status: "published", publishedAt: new Date() } }
  );
  console.log(`Migrated ${migrated.modifiedCount} problems → published`);

  const count = await col.countDocuments({
    $or: [{ status: "published" }, { status: { $exists: false } }],
  });
  console.log(`Published problems now: ${count}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
