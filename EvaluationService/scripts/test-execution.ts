/**
 * End-to-end regression suite for the execution engine.
 *
 * Run from EvaluationService:
 *   DOCKER_SOCKET=/var/run/docker.sock npx ts-node scripts/test-execution.ts
 */
import { runCodeInDocker } from "../src/utils/containers/codeRunner.util";
import { outputsMatch } from "../src/execution/compareOutputs";
import { prepareExecution } from "../src/execution/prepare";
import type { ProgrammingLanguage } from "../src/types/evaluation.type";

type Case = {
  name: string;
  language: ProgrammingLanguage;
  code: string;
  input: string;
  expected?: string;
  expectCompileError?: boolean;
  functionName?: string;
  className?: string;
};

const TWO_SUM_CPP = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> mp;
        for (int i = 0; i < (int)nums.size(); i++) {
            int complement = target - nums[i];
            if (mp.find(complement) != mp.end()) {
                return {mp[complement], i};
            }
            mp[nums[i]] = i;
        }
        return {};
    }
};`;

const CASES: Case[] = [
  {
    name: "C++ vector identity",
    language: "cpp",
    functionName: "reverseArray",
    code: `class Solution {
public:
    vector<int> reverseArray(vector<int>& nums) {
        return nums;
    }
};`,
    input: "[1,2,3]",
    expected: "[1,2,3]",
  },
  {
    name: "C++ unordered_map twoSum",
    language: "cpp",
    functionName: "twoSum",
    code: TWO_SUM_CPP,
    input: "[2,7,11,15]\n9",
    expected: "[0,1]",
  },
  {
    name: "C++ unordered_set containsDuplicate",
    language: "cpp",
    functionName: "containsDuplicate",
    code: `class Solution {
public:
    bool containsDuplicate(vector<int>& nums) {
        unordered_set<int> st;
        for (int x : nums) {
            if (st.count(x)) return true;
            st.insert(x);
        }
        return false;
    }
};`,
    input: "[1,2,3,1]",
    expected: "true",
  },
  {
    name: "C++ map + set + queue + stack + pq + sort + string + pair",
    language: "cpp",
    functionName: "findMax",
    code: `class Solution {
public:
    int findMax(vector<int>& nums) {
        map<int,int> mp;
        set<int> st;
        queue<int> q;
        stack<int> sk;
        priority_queue<int> pq;
        string s = "ok";
        pair<int,int> p = {1,2};
        for (int x : nums) {
            mp[x]++; st.insert(x); q.push(x); sk.push(x); pq.push(x);
        }
        sort(nums.begin(), nums.end());
        return nums.empty() ? 0 : nums.back();
    }
};`,
    input: "[3,1,2]",
    expected: "3",
  },
  {
    name: "C++ nested vector compile",
    language: "cpp",
    functionName: "findMax",
    code: `class Solution {
public:
    int findMax(vector<int>& nums) {
        vector<vector<int>> matrix = {{1,2},{3,4}};
        return nums.empty() ? matrix[0][0] : nums[0];
    }
};`,
    input: "[9]",
    expected: "9",
  },
  {
    name: "C++ full program no duplicate main",
    language: "cpp",
    code: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello World";
    return 0;
}`,
    input: "",
    expected: "Hello World",
  },
  {
    name: "Python class twoSum",
    language: "python",
    functionName: "twoSum",
    code: `class Solution:
    def twoSum(self, nums, target):
        mp = {}
        for i, value in enumerate(nums):
            complement = target - value
            if complement in mp:
                return [mp[complement], i]
            mp[value] = i
        return []
`,
    input: "[2,7,11,15]\n9",
    expected: "[0,1]",
  },
  {
    name: "JavaScript function twoSum",
    language: "javascript",
    functionName: "twoSum",
    code: `var twoSum = function(nums, target) {
    const map = new Map();
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (map.has(complement)) {
            return [map.get(complement), i];
        }
        map.set(nums[i], i);
    }
    return [];
};
`,
    input: "[2,7,11,15]\n9",
    expected: "[0,1]",
  },
  {
    name: "Java class twoSum HashMap",
    language: "java",
    functionName: "twoSum",
    code: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        java.util.HashMap<Integer, Integer> map = new java.util.HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[]{map.get(complement), i};
            }
            map.put(nums[i], i);
        }
        return new int[]{};
    }
}
`,
    input: "[2,7,11,15]\n9",
    expected: "[0,1]",
  },
  {
    name: "C++ compilation error surfaced",
    language: "cpp",
    functionName: "twoSum",
    code: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        NotARealType x;
        return {};
    }
};`,
    input: "[1,2]\n3",
    expectCompileError: true,
  },
];

async function runCase(c: Case): Promise<{ ok: boolean; detail: string }> {
  // Sanity: prepare must not inject duplicate main for full programs
  if (c.name.includes("full program")) {
    const prepared = prepareExecution(c.language, c.code, {
      functionName: c.functionName,
      className: c.className,
    });
    const src = Object.values(prepared.files).join("\n");
    const mains = (src.match(/\bint\s+main\s*\(/g) || []).length;
    if (mains !== 1) {
      return { ok: false, detail: `expected 1 main(), found ${mains}` };
    }
  }

  const result = await runCodeInDocker({
    code: c.code,
    language: c.language,
    input: c.input,
    timeLimitMs: 5000,
    memoryLimitMb: 256,
    meta: {
      functionName: c.functionName,
      className: c.className || "Solution",
    },
  });

  if (c.expectCompileError) {
    const ok = result.exitCode === 99 || /error:/i.test(result.stderr);
    return {
      ok,
      detail: ok
        ? `compile error OK: ${result.stderr.slice(0, 120)}`
        : `expected compile error, got exit=${result.exitCode} stderr=${result.stderr}`,
    };
  }

  if (result.timedOut) {
    return { ok: false, detail: "TLE" };
  }
  if (result.exitCode !== 0) {
    return {
      ok: false,
      detail: `exit=${result.exitCode} stderr=${result.stderr.slice(0, 300)} stdout=${result.stdout.slice(0, 100)}`,
    };
  }

  if (c.expected !== undefined && !outputsMatch(result.stdout, c.expected)) {
    return {
      ok: false,
      detail: `expected=${JSON.stringify(c.expected)} actual=${JSON.stringify(result.stdout)}`,
    };
  }

  return { ok: true, detail: `stdout=${JSON.stringify(result.stdout)} time=${result.timeMs}ms` };
}

async function main() {
  console.log("=== Execution Engine Regression Suite ===\n");
  let passed = 0;
  let failed = 0;

  for (const c of CASES) {
    process.stdout.write(`• ${c.name} ... `);
    try {
      const r = await runCase(c);
      if (r.ok) {
        passed++;
        console.log(`PASS (${r.detail})`);
      } else {
        failed++;
        console.log(`FAIL (${r.detail})`);
      }
    } catch (err: any) {
      failed++;
      console.log(`FAIL (exception: ${err.message})`);
    }
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed, ${CASES.length} total`);
  process.exit(failed ? 1 : 0);
}

main();
