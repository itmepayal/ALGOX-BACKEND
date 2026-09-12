/**
 * Replace ALL problems with exactly 5 curated questions.
 * Each problem includes JavaScript, Python, and C++ starters + testcases.
 *
 * Run from ProblemService:
 *   node scripts/seed-five-problems.js
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
  };
}

const PROBLEMS = [
  {
    title: "Two Sum",
    slug: "two-sum",
    difficulty: "easy",
    category: "Array",
    tags: ["Array", "Hash Table", "Two Pointers"],
    description: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers that add up to \`target\`.

You may assume each input has exactly one solution, and you may not use the same element twice.

Return the answer in any order.`,
    constraints: `• 2 ≤ nums.length ≤ 10^4
• -10^9 ≤ nums[i] ≤ 10^9
• -10^9 ≤ target ≤ 10^9
• Exactly one valid answer exists`,
    functionName: "twoSum",
    className: "Solution",
    starterCode: {
      javascript: `function twoSum(nums, target) {
    // return [index1, index2]
}
`,
      python: `class Solution:
    def twoSum(self, nums, target):
        # return [index1, index2]
        pass
`,
      cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // return {index1, index2}
    }
};`,
    },
    examples: [
      {
        input: { nums: [2, 7, 11, 15], target: 9 },
        output: "[0,1]",
        explanation: "nums[0] + nums[1] = 2 + 7 = 9",
      },
      {
        input: { nums: [3, 2, 4], target: 6 },
        output: "[1,2]",
      },
    ],
    testcases: [
      tc({ nums: [2, 7, 11, 15], target: 9 }, "[0,1]", false, 1),
      tc({ nums: [3, 2, 4], target: 6 }, "[1,2]", false, 2),
      tc({ nums: [3, 3], target: 6 }, "[0,1]", false, 3),
      tc({ nums: [1, 5, 3, 7], target: 8 }, "[1,2]", true, 4),
      tc({ nums: [-1, -2, -3, -4, -5], target: -8 }, "[2,4]", true, 5),
    ],
  },
  {
    title: "Maximum Subarray",
    slug: "maximum-subarray",
    difficulty: "medium",
    category: "Array",
    tags: ["Array", "Dynamic Programming", "Kadane"],
    description: `Given an integer array \`nums\`, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum.

Use Kadane's algorithm for an O(n) solution.`,
    constraints: `• 1 ≤ nums.length ≤ 10^5
• -10^4 ≤ nums[i] ≤ 10^4`,
    functionName: "maxSubArray",
    className: "Solution",
    starterCode: {
      javascript: `function maxSubArray(nums) {
    // return largest subarray sum
}
`,
      python: `class Solution:
    def maxSubArray(self, nums):
        # return largest subarray sum
        pass
`,
      cpp: `class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        // return largest subarray sum
    }
};`,
    },
    examples: [
      {
        input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] },
        output: "6",
        explanation: "Subarray [4,-1,2,1] has the largest sum 6.",
      },
      { input: { nums: [1] }, output: "1" },
      { input: { nums: [-1] }, output: "-1" },
    ],
    testcases: [
      tc({ nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] }, "6", false, 1),
      tc({ nums: [1] }, "1", false, 2),
      tc({ nums: [-1] }, "-1", false, 3),
      tc({ nums: [-5, -2, -8, -1] }, "-1", true, 4),
      tc({ nums: [5, 4, -1, 7, 8] }, "23", true, 5),
      tc({ nums: [-2, 1] }, "1", true, 6),
    ],
  },
  {
    title: "Contains Duplicate",
    slug: "contains-duplicate",
    difficulty: "easy",
    category: "Array",
    tags: ["Array", "Hash Table", "Sorting"],
    description: `Given an integer array \`nums\`, return \`true\` if any value appears at least twice, otherwise return \`false\`.`,
    constraints: `• 1 ≤ nums.length ≤ 10^5
• -10^9 ≤ nums[i] ≤ 10^9`,
    functionName: "containsDuplicate",
    className: "Solution",
    starterCode: {
      javascript: `function containsDuplicate(nums) {
    // return true if any value appears twice
}
`,
      python: `class Solution:
    def containsDuplicate(self, nums):
        # return True if any value appears twice
        pass
`,
      cpp: `class Solution {
public:
    bool containsDuplicate(vector<int>& nums) {
        // return true if any value appears twice
    }
};`,
    },
    examples: [
      {
        input: { nums: [1, 2, 3, 1] },
        output: "true",
        explanation: "1 appears twice.",
      },
      { input: { nums: [1, 2, 3, 4] }, output: "false" },
    ],
    testcases: [
      tc({ nums: [1, 2, 3, 1] }, "true", false, 1),
      tc({ nums: [1, 2, 3, 4] }, "false", false, 2),
      tc({ nums: [1, 1, 1, 3, 3, 4, 3, 2, 4, 2] }, "true", false, 3),
      tc({ nums: [0] }, "false", true, 4),
      tc({ nums: [-1, 0, 1, -1] }, "true", true, 5),
    ],
  },
  {
    title: "Reverse an Array",
    slug: "reverse-an-array",
    difficulty: "easy",
    category: "Two Pointers",
    tags: ["Array", "Two Pointers"],
    description: `Given an integer array \`nums\`, return a new array with the elements in reverse order.

You can use the two-pointer pattern: swap from both ends and move inward.`,
    constraints: `• 0 ≤ nums.length ≤ 10^4
• -10^9 ≤ nums[i] ≤ 10^9`,
    functionName: "reverseArray",
    className: "Solution",
    starterCode: {
      javascript: `function reverseArray(nums) {
    // return reversed array
}
`,
      python: `class Solution:
    def reverseArray(self, nums):
        # return reversed array
        pass
`,
      cpp: `class Solution {
public:
    vector<int> reverseArray(vector<int>& nums) {
        // return reversed array
    }
};`,
    },
    examples: [
      {
        input: { nums: [1, 2, 3, 4, 5] },
        output: "[5,4,3,2,1]",
      },
      { input: { nums: [1] }, output: "[1]" },
    ],
    testcases: [
      tc({ nums: [1, 2, 3, 4, 5] }, "[5,4,3,2,1]", false, 1),
      tc({ nums: [1] }, "[1]", false, 2),
      tc({ nums: [] }, "[]", false, 3),
      tc({ nums: [9, 8] }, "[8,9]", true, 4),
      tc({ nums: [-1, 0, 2] }, "[2,0,-1]", true, 5),
    ],
  },
  {
    title: "Find Maximum Element",
    slug: "find-maximum-element",
    difficulty: "easy",
    category: "Array",
    tags: ["Array", "Basics"],
    description: `Given a non-empty integer array \`nums\`, return the largest number in the array.

This is a fundamentals warm-up: scan once and track the maximum.`,
    constraints: `• 1 ≤ nums.length ≤ 10^4
• -10^9 ≤ nums[i] ≤ 10^9`,
    functionName: "findMax",
    className: "Solution",
    starterCode: {
      javascript: `function findMax(nums) {
    // return the maximum number
}
`,
      python: `class Solution:
    def findMax(self, nums):
        # return the maximum number
        pass
`,
      cpp: `class Solution {
public:
    int findMax(vector<int>& nums) {
        // return the maximum number
    }
};`,
    },
    examples: [
      {
        input: { nums: [3, 1, 4, 1, 5, 9] },
        output: "9",
      },
      { input: { nums: [-5, -2, -9] }, output: "-2" },
    ],
    testcases: [
      tc({ nums: [3, 1, 4, 1, 5, 9] }, "9", false, 1),
      tc({ nums: [-5, -2, -9] }, "-2", false, 2),
      tc({ nums: [7] }, "7", false, 3),
      tc({ nums: [0, 0, 0] }, "0", true, 4),
      tc({ nums: [100, -100, 50] }, "100", true, 5),
    ],
  },
];

(async () => {
  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL missing in ProblemService/.env");
  }

  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  const problems = db.collection("problems");

  const before = await problems.countDocuments();
  console.log("Existing problems:", before);

  // Clear related engagement docs if present
  for (const name of [
    "problemreactions",
    "problembookmarks",
    "problemrevisions",
  ]) {
    try {
      const n = await db.collection(name).deleteMany({});
      console.log(`Cleared ${name}:`, n.deletedCount);
    } catch {
      // collection may not exist
    }
  }

  const del = await problems.deleteMany({});
  console.log("Deleted problems:", del.deletedCount);

  const now = new Date();
  const docs = PROBLEMS.map((p) => ({
    ...p,
    codeStubs: stubs(p.starterCode),
    editorial: "",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    likeCount: 0,
    dislikeCount: 0,
    bookmarkCount: 0,
    resources: [],
    createdAt: now,
    updatedAt: now,
  }));

  const ins = await problems.insertMany(docs);
  console.log("Inserted problems:", Object.keys(ins.insertedIds).length);

  const list = await problems
    .find({}, { projection: { title: 1, slug: 1, difficulty: 1, category: 1 } })
    .sort({ category: 1, title: 1 })
    .toArray();
  console.log(JSON.stringify(list, null, 2));

  await mongoose.disconnect();
  console.log("Done. Exactly 5 problems with JS / Python / C++ starters.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
