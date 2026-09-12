import { ProgrammingLanguage } from "../types/evaluation.type";
import type { LanguageRuntimeConfig } from "./types";
import { DOCKER_IMAGES, DEFAULT_LIMITS } from "../utils/constants";

export const LANGUAGE_CONFIG: Record<ProgrammingLanguage, LanguageRuntimeConfig> = {
  cpp: {
    language: "cpp",
    versionLabel: "C++17 (g++)",
    extension: ".cpp",
    image: DOCKER_IMAGES.cpp,
    compile: {
      command: "g++ -O2 -std=c++17 -pipe",
      timeoutMs: DEFAULT_LIMITS.COMPILE_TIMEOUT_MS,
    },
    run: { command: "./solution" },
    timeMultiplier: 1,
    defaultMemoryMb: DEFAULT_LIMITS.MEMORY_LIMIT_MB,
    cppStandard: "c++17",
  },
  python: {
    language: "python",
    versionLabel: "Python 3.10",
    extension: ".py",
    image: DOCKER_IMAGES.python,
    run: { command: "python3 runner.py" },
    timeMultiplier: 5,
    defaultMemoryMb: DEFAULT_LIMITS.MEMORY_LIMIT_MB,
  },
  javascript: {
    language: "javascript",
    versionLabel: "Node.js 18",
    extension: ".js",
    image: DOCKER_IMAGES.javascript,
    run: { command: "node runner.js" },
    timeMultiplier: 3,
    defaultMemoryMb: DEFAULT_LIMITS.MEMORY_LIMIT_MB,
  },
  java: {
    language: "java",
    versionLabel: "Java 17",
    extension: ".java",
    image: DOCKER_IMAGES.java,
    compile: {
      command: "javac",
      timeoutMs: DEFAULT_LIMITS.COMPILE_TIMEOUT_MS,
    },
    run: { command: "java Main" },
    timeMultiplier: 2,
    defaultMemoryMb: DEFAULT_LIMITS.MEMORY_LIMIT_MB,
  },
};

export function getLanguageConfig(
  language: ProgrammingLanguage
): LanguageRuntimeConfig {
  const cfg = LANGUAGE_CONFIG[language];
  if (!cfg) {
    throw new Error(`Unsupported programming language: ${language}`);
  }
  return cfg;
}
