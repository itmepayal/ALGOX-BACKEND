/**
 * Repair Maximum Subarray problem data used by the judge + UI.
 * Run: node scripts/fix-maximum-subarray.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const STARTER = {
  cpp: `class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        // return largest subarray sum
    }
};`,
  python: `class Solution:
    def maxSubArray(self, nums):
        # return largest subarray sum
        pass
`,
  javascript: `function maxSubArray(nums) {
    // return largest subarray sum
}
`,
};

const testcases = [
  { input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] }, output: "6", expectedOutput: "6", isHidden: false, order: 1 },
  { input: { nums: [1] }, output: "1", expectedOutput: "1", isHidden: false, order: 2 },
  { input: { nums: [-1] }, output: "-1", expectedOutput: "-1", isHidden: false, order: 3 },
  { input: { nums: [-5, -2, -8, -1] }, output: "-1", expectedOutput: "-1", isHidden: true, order: 4 },
  { input: { nums: [5, 4, -1, 7, 8] }, output: "23", expectedOutput: "23", isHidden: true, order: 5 },
  { input: { nums: [-2, 1] }, output: "1", expectedOutput: "1", isHidden: true, order: 6 },
  { input: { nums: [0] }, output: "0", expectedOutput: "0", isHidden: true, order: 7 },
];

const examples = [
  {
    input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] },
    output: "6",
    explanation: "Subarray [4,-1,2,1] has the largest sum 6.",
  },
  { input: { nums: [1] }, output: "1" },
  { input: { nums: [-1] }, output: "-1" },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const col = mongoose.connection.db.collection("problems");
  const r = await col.updateOne(
    { slug: "maximum-subarray" },
    {
      $set: {
        testcases,
        examples,
        starterCode: STARTER,
        codeStubs: [
          { language: "cpp", startSnippet: "", userTemplate: STARTER.cpp },
          { language: "python", startSnippet: "", userTemplate: STARTER.python },
          { language: "javascript", startSnippet: "", userTemplate: STARTER.javascript },
        ],
        functionName: "maxSubArray",
        className: "Solution",
        timeLimitMs: 1000,
        memoryLimitMb: 128,
        updatedAt: new Date(),
      },
    }
  );
  console.log("matched=%d modified=%d", r.matchedCount, r.modifiedCount);
  const p = await col.findOne(
    { slug: "maximum-subarray" },
    { projection: { title: 1, testcases: 1, examples: 1 } }
  );
  console.log(JSON.stringify(p, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
