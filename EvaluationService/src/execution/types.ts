import { ProgrammingLanguage } from "../types/evaluation.type";

export type ExecutionMode = "function" | "program";

export type JudgeParamType =
  | "int"
  | "long"
  | "long long"
  | "float"
  | "double"
  | "bool"
  | "string"
  | "char"
  | "vector<int>"
  | "vector<long long>"
  | "vector<string>"
  | "vector<vector<int>>"
  | "vector<vector<string>>"
  | "ListNode"
  | "TreeNode"
  | "any";

export interface JudgeParameter {
  name: string;
  type: JudgeParamType;
}

export interface JudgeMeta {
  /** Prefer "function" for LeetCode-style Solution classes. */
  executionMode?: ExecutionMode;
  className?: string;
  functionName?: string;
  returnType?: JudgeParamType | string;
  parameters?: JudgeParameter[];
}

export interface PreparedExecution {
  language: ProgrammingLanguage;
  mode: ExecutionMode;
  /** Primary source filename inside the container. */
  entryFile: string;
  /** Map of filename → source contents. */
  files: Record<string, string>;
  compileCmd?: string;
  runCmd: string;
  /** Human-readable summary for logs. */
  summary: string;
}

export interface LanguageRuntimeConfig {
  language: ProgrammingLanguage;
  versionLabel: string;
  extension: string;
  image: string;
  compile?: {
    command: string;
    timeoutMs: number;
  };
  run: {
    command: string;
  };
  timeMultiplier: number;
  defaultMemoryMb: number;
  cppStandard?: string;
}
