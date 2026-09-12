import { ProgrammingLanguage } from "../types/evaluation.type";
import { prepareCppSource } from "./adapters/cpp";
import { preparePythonSource } from "./adapters/python";
import { prepareJavaScriptSource } from "./adapters/javascript";
import { prepareJavaSource } from "./adapters/java";
import { JudgeMeta, PreparedExecution } from "./types";
import logger from "../config/logger.config";

export function prepareExecution(
  language: ProgrammingLanguage,
  code: string,
  meta?: JudgeMeta
): PreparedExecution {
  logger.info("[Execution] preparing source", {
    language,
    functionName: meta?.functionName,
    className: meta?.className,
  });

  let prepared: PreparedExecution;
  switch (language) {
    case "cpp":
      prepared = prepareCppSource(code, meta);
      break;
    case "python":
      prepared = preparePythonSource(code, meta);
      break;
    case "javascript":
      prepared = prepareJavaScriptSource(code, meta);
      break;
    case "java":
      prepared = prepareJavaSource(code, meta);
      break;
    default:
      throw new Error(`Unsupported programming language: ${language}`);
  }

  logger.info("[Execution] source prepared", {
    language,
    mode: prepared.mode,
    summary: prepared.summary,
    files: Object.keys(prepared.files),
  });

  return prepared;
}

export { outputsMatch, normalizeOutputString } from "./compareOutputs";
export type { JudgeMeta, PreparedExecution } from "./types";
export { getLanguageConfig, LANGUAGE_CONFIG } from "./languageConfig";
export { resolveJudgeMeta, detectExecutionMode } from "./detectMode";
