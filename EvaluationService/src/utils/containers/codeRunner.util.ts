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

const docker = new Docker();

export interface RunCodeOptions {
  code: string;
  language: ProgrammingLanguage;
  input: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
}

export async function runCodeInDocker(
  options: RunCodeOptions
): Promise<ExecutionResult> {
  const timeLimitMs = options.timeLimitMs || DEFAULT_LIMITS.TIME_LIMIT_MS;
  const memoryLimitMb = options.memoryLimitMb || DEFAULT_LIMITS.MEMORY_LIMIT_MB;
  const memoryBytes = memoryLimitMb * 1024 * 1024;

  const imageName = DOCKER_IMAGES[options.language];
  if (!imageName) {
    throw new Error(`${EVALUATION_MESSAGES.UNSUPPORTED_LANGUAGE}: ${options.language}`);
  }

  const { cmd } = getLanguageCmd(options.language, options.code);

  const container = await docker.createContainer({
    Image: imageName,
    Cmd: cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: false,
    Tty: false,
    HostConfig: {
      Memory: memoryBytes,
      PidsLimit: DOCKER_CONTAINER_CONFIG.PIDS_LIMIT,
      CpuQuota: DOCKER_CONTAINER_CONFIG.CPU_QUOTA,
      CpuPeriod: DOCKER_CONTAINER_CONFIG.CPU_PERIOD,
      SecurityOpt: [...DOCKER_CONTAINER_CONFIG.SECURITY_OPT],
      NetworkMode: DOCKER_CONTAINER_CONFIG.NETWORK_MODE,
    },
  });

  const startTime = Date.now();
  let timedOut = false;

  try {
    const stream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
    });

    await container.start();

    // Write Stdin input
    stream.write(options.input + "\n");
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
        } catch (e) {
          // container already terminated
        }
        reject(new Error(EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG));
      }, timeLimitMs);

      container.wait().finally(() => clearTimeout(timer));
    });

    const waitPromise = container.wait();

    let exitCode = 0;
    try {
      const waitRes = await Promise.race([waitPromise, timeoutPromise]);
      exitCode = (waitRes as any)?.StatusCode ?? 0;
    } catch (err: any) {
      if (timedOut) {
        return {
          stdout: "",
          stderr: EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG,
          exitCode: 124,
          timeMs: timeLimitMs,
          memoryMb: memoryLimitMb,
          timedOut: true,
        };
      }
      stderr += err.message;
    }

    const executionTimeMs = Date.now() - startTime;
    const stats = await container.stats({ stream: false });
    const memoryMb = Math.round(
      (stats.memory_stats?.usage || 0) / (1024 * 1024)
    );

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

function getLanguageCmd(
  language: ProgrammingLanguage,
  code: string
): { cmd: string[] } {
  const escapedCode = code.replace(/"/g, '\\"');

  switch (language) {
    case "python":
      return {
        cmd: ["python3", "-c", code],
      };
    case "javascript":
      return {
        cmd: ["node", "-e", code],
      };
    case "cpp":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${escapedCode}" > solution.cpp && g++ -O3 solution.cpp -o solution && ./solution`,
        ],
      };
    case "java":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${escapedCode}" > Solution.java && javac Solution.java && java Solution`,
        ],
      };
    default:
      throw new Error(`${EVALUATION_MESSAGES.UNSUPPORTED_LANGUAGE}: ${language}`);
  }
}
