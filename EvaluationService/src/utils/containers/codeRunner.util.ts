import Docker from "dockerode";
import {
  ProgrammingLanguage,
  ExecutionResult,
} from "../../types/evaluation.type";
import {
  DOCKER_IMAGES,
  DEFAULT_LIMITS,
  DOCKER_CONTAINER_CONFIG,
  EVALUATION_MESSAGES,
} from "../constants";
import logger from "../../config/logger.config";
import { prepareExecution, JudgeMeta } from "../../execution/prepare";

const docker = new Docker({
  socketPath:
    process.env.DOCKER_SOCKET ||
    process.env.DOCKER_HOST?.replace("unix://", "") ||
    "/var/run/docker.sock",
});

export interface RunCodeOptions {
  code: string;
  language: ProgrammingLanguage;
  input: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  compileTimeoutMs?: number;
  /** Problem signature metadata for LeetCode-style drivers. */
  meta?: JudgeMeta;
}

const COMPILED_LANGUAGES: ProgrammingLanguage[] = ["cpp", "java"];

const COMPILE_ERROR_EXIT_CODE = 99;
const COMPILE_ERROR_MARKER = "COMPILATION_ERROR";

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function buildContainerCommand(
  language: ProgrammingLanguage,
  prepared: ReturnType<typeof prepareExecution>
): string[] {
  const writeCmds = Object.entries(prepared.files).map(([filename, content]) => {
    const b64 = Buffer.from(content, "utf8").toString("base64");
    return `echo ${shellSingleQuote(b64)} | base64 -d > ${shellSingleQuote(filename)}`;
  });

  const compileBlock = prepared.compileCmd
    ? `${prepared.compileCmd} 2> /tmp/compile_err.txt || {
  echo "${COMPILE_ERROR_MARKER}" >&2
  cat /tmp/compile_err.txt >&2
  exit ${COMPILE_ERROR_EXIT_CODE}
}`
    : "";

  const script = [
    ...writeCmds,
    compileBlock,
    prepared.runCmd,
  ]
    .filter(Boolean)
    .join("\n");

  logger.info("[Execution] container command built", {
    language,
    mode: prepared.mode,
    summary: prepared.summary,
  });

  return ["sh", "-c", script];
}

export async function runCodeInDocker(
  options: RunCodeOptions
): Promise<ExecutionResult> {
  const timeLimitMs = options.timeLimitMs || DEFAULT_LIMITS.TIME_LIMIT_MS;
  const compileTimeoutMs =
    options.compileTimeoutMs || DEFAULT_LIMITS.COMPILE_TIMEOUT_MS;
  const memoryLimitMb = options.memoryLimitMb || DEFAULT_LIMITS.MEMORY_LIMIT_MB;

  const isCompiled = COMPILED_LANGUAGES.includes(options.language);
  const effectiveTimeLimitMs = isCompiled
    ? timeLimitMs + compileTimeoutMs
    : timeLimitMs;

  const containerMemoryMb = isCompiled
    ? Math.max(memoryLimitMb, 512)
    : memoryLimitMb;
  const memoryBytes = containerMemoryMb * 1024 * 1024;

  const imageName = DOCKER_IMAGES[options.language];
  if (!imageName) {
    throw new Error(
      `${EVALUATION_MESSAGES.UNSUPPORTED_LANGUAGE}: ${options.language}`
    );
  }

  logger.info("[Execution] submission received", {
    language: options.language,
    functionName: options.meta?.functionName,
  });

  const prepared = prepareExecution(
    options.language,
    options.code,
    options.meta
  );

  logger.info("[Execution] mode resolved", {
    language: options.language,
    mode: prepared.mode,
    summary: prepared.summary,
  });

  const cmd = buildContainerCommand(options.language, prepared);

  const container = await docker.createContainer({
    Image: imageName,
    Cmd: cmd,
    User: DOCKER_CONTAINER_CONFIG.USER,
    WorkingDir: DOCKER_CONTAINER_CONFIG.WORKING_DIR,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: true,
    Tty: false,
    HostConfig: {
      Memory: memoryBytes,
      MemorySwap: memoryBytes,
      PidsLimit: DOCKER_CONTAINER_CONFIG.PIDS_LIMIT,
      CpuQuota: DOCKER_CONTAINER_CONFIG.CPU_QUOTA,
      CpuPeriod: DOCKER_CONTAINER_CONFIG.CPU_PERIOD,
      SecurityOpt: [...DOCKER_CONTAINER_CONFIG.SECURITY_OPT],
      NetworkMode: DOCKER_CONTAINER_CONFIG.NETWORK_MODE,
      CapDrop: [...DOCKER_CONTAINER_CONFIG.CAP_DROP],
      ReadonlyRootfs: DOCKER_CONTAINER_CONFIG.READONLY_ROOTFS,
      Tmpfs: { ...DOCKER_CONTAINER_CONFIG.TMPFS },
    },
    // Do not override image PATH/JAVA_HOME — that breaks javac/java on Temurin images.
    // Host secrets are not forwarded; NetworkMode is already "none".
  });

  const startTime = Date.now();
  let timedOut = false;

  try {
    logger.info("[Execution] compiling/executing", {
      language: options.language,
      mode: prepared.mode,
    });

    const stream = await container.attach({
      stream: true,
      hijack: true,
      stdin: true,
      stdout: true,
      stderr: true,
    });

    await container.start();

    await new Promise((r) => setTimeout(r, 50));
    stream.write(Buffer.from(String(options.input ?? "") + "\n"));
    stream.end();

    let stdout = "";
    let stderr = "";

    container.modem.demuxStream(
      stream,
      {
        write: (chunk: Buffer) => {
          stdout += chunk.toString();
        },
      },
      {
        write: (chunk: Buffer) => {
          stderr += chunk.toString();
        },
      }
    );

    const timeoutPromise = new Promise<void>((_, reject) => {
      const timer = setTimeout(async () => {
        timedOut = true;
        try {
          await container.kill();
        } catch {
          /* ignore */
        }
        reject(new Error(EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG));
      }, effectiveTimeLimitMs);

      container.wait().finally(() => clearTimeout(timer));
    });

    const waitPromise = container.wait();

    let exitCode = 0;
    try {
      const waitRes = await Promise.race([waitPromise, timeoutPromise]);
      exitCode = (waitRes as { StatusCode?: number })?.StatusCode ?? 0;
    } catch (err: unknown) {
      if (timedOut) {
        logger.info("[Execution] TIME_LIMIT_EXCEEDED");
        return {
          stdout: "",
          stderr: EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG,
          exitCode: 124,
          timeMs: timeLimitMs,
          memoryMb: memoryLimitMb,
          timedOut: true,
        };
      }
      stderr += err instanceof Error ? err.message : String(err);
    }

    await new Promise((r) => setTimeout(r, 100));

    const executionTimeMs = Date.now() - startTime;
    const stats = await container.stats({ stream: false });
    const memoryMb = Math.round(
      (stats.memory_stats?.usage || 0) / (1024 * 1024)
    );

    if (exitCode === 137) {
      logger.info("[Execution] MEMORY_LIMIT_EXCEEDED");
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim() || "Memory Limit Exceeded (process killed)",
        exitCode,
        timeMs: executionTimeMs,
        memoryMb: memoryLimitMb,
        timedOut: false,
      };
    }

    if (
      isCompiled &&
      exitCode === COMPILE_ERROR_EXIT_CODE &&
      stderr.includes(COMPILE_ERROR_MARKER)
    ) {
      logger.info("[Execution] COMPILATION_ERROR");
      return {
        stdout: "",
        stderr: stderr.replace(COMPILE_ERROR_MARKER, "").trim(),
        exitCode,
        timeMs: executionTimeMs,
        memoryMb,
        timedOut: false,
      };
    }

    logger.info("[Execution] execution_complete", {
      exitCode,
      timeMs: executionTimeMs,
      stdoutPreview: stdout.trim().slice(0, 120),
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode,
      timeMs: executionTimeMs,
      memoryMb,
      timedOut: false,
    };
  } finally {
    try {
      await container.remove({ force: true });
    } catch (e) {
      logger.warn(`Failed to remove docker container: ${(e as Error).message}`);
    }
  }
}
