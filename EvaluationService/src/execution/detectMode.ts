import { ExecutionMode, JudgeMeta, JudgeParameter, JudgeParamType } from "./types";

/** Well-known LeetCode-style signatures for seeded / common problems. */
const KNOWN_SIGNATURES: Record<
  string,
  { parameters: JudgeParameter[]; returnType: JudgeParamType }
> = {
  twoSum: {
    parameters: [
      { name: "nums", type: "vector<int>" },
      { name: "target", type: "int" },
    ],
    returnType: "vector<int>",
  },
  maxSubArray: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "int",
  },
  containsDuplicate: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "bool",
  },
  reverseArray: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "vector<int>",
  },
  findMax: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "int",
  },
  arraySum: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "int",
  },
  countEven: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "int",
  },
  moveZeroes: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "vector<int>",
  },
  maxProfit: {
    parameters: [{ name: "prices", type: "vector<int>" }],
    returnType: "int",
  },
  productExceptSelf: {
    parameters: [{ name: "nums", type: "vector<int>" }],
    returnType: "vector<int>",
  },
  search: {
    parameters: [
      { name: "nums", type: "vector<int>" },
      { name: "target", type: "int" },
    ],
    returnType: "int",
  },
};

const MAIN_PATTERNS: Record<string, RegExp> = {
  cpp: /\bint\s+main\s*\(/,
  java: /\b(?:public\s+)?static\s+void\s+main\s*\(/,
  python: /if\s+__name__\s*==\s*['"]__main__['"]/,
  javascript: /\b(?:require\.main\s*===\s*module|process\.argv)/,
};

/**
 * Detect whether user source is a full program (has its own entrypoint).
 */
export function detectExecutionMode(
  language: string,
  code: string,
  preferred?: ExecutionMode
): ExecutionMode {
  if (preferred === "program" || preferred === "function") return preferred;
  const re = MAIN_PATTERNS[language];
  if (re && re.test(code)) return "program";
  return "function";
}

/** Extract first Solution method name from C++/Java/Python class bodies. */
export function detectFunctionName(code: string, language: string): string | undefined {
  if (language === "cpp" || language === "java") {
    const m = code.match(
      /(?:public\s+)?(?:static\s+)?(?:[\w:<>,\s*&]+)\s+(\w+)\s*\([^;]*\)\s*(?:const)?\s*\{/
    );
    // Prefer methods inside Solution; skip constructors named Solution
    const all = [
      ...code.matchAll(
        /(?:public\s+)?(?:static\s+)?(?:[\w:<>,\s*&]+)\s+(\w+)\s*\([^;{]*\)\s*(?:const)?\s*\{/g
      ),
    ]
      .map((x) => x[1])
      .filter((n) => n && n !== "Solution" && n !== "main" && n !== "if");
    return all[0] || m?.[1];
  }

  if (language === "python") {
    const m = code.match(/def\s+(\w+)\s*\(/);
    const methods = [...code.matchAll(/def\s+(\w+)\s*\(/g)]
      .map((x) => x[1])
      .filter((n) => n !== "__init__");
    return methods[0] || m?.[1];
  }

  if (language === "javascript") {
    const fn =
      code.match(/function\s+(\w+)\s*\(/)?.[1] ||
      code.match(/(?:var|let|const)\s+(\w+)\s*=\s*function\s*\(/)?.[1] ||
      code.match(/(?:var|let|const)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/)?.[1];
    return fn;
  }

  return undefined;
}

export function resolveJudgeMeta(
  code: string,
  language: string,
  meta?: JudgeMeta
): Required<Pick<JudgeMeta, "className" | "functionName">> &
  JudgeMeta & { mode: ExecutionMode } {
  const mode = detectExecutionMode(language, code, meta?.executionMode);
  const className = meta?.className || "Solution";

  let functionName =
    meta?.functionName ||
    detectFunctionName(code, language) ||
    "solution";

  // Prefer known signature match if code contains that name
  if (!meta?.functionName) {
    for (const name of Object.keys(KNOWN_SIGNATURES)) {
      if (new RegExp(`\\b${name}\\b`).test(code)) {
        functionName = name;
        break;
      }
    }
  }

  const known = KNOWN_SIGNATURES[functionName];
  return {
    ...meta,
    mode,
    className,
    functionName,
    parameters: meta?.parameters?.length
      ? meta.parameters
      : known?.parameters || [{ name: "nums", type: "vector<int>" }],
    returnType: meta?.returnType || known?.returnType || "any",
  };
}

export function hasUsingNamespaceStd(code: string): boolean {
  return /\busing\s+namespace\s+std\s*;/.test(code);
}

export function hasBitsHeader(code: string): boolean {
  return /#\s*include\s*<bits\/stdc\+\+\.h>/.test(code);
}
