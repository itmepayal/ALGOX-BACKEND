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
  compileTimeoutMs?: number;
}

const COMPILED_LANGUAGES: ProgrammingLanguage[] = ["cpp", "java"];

const COMPILE_ERROR_EXIT_CODE = 99;
const COMPILE_ERROR_MARKER = "COMPILATION_ERROR";

export async function runCodeInDocker(
  options: RunCodeOptions
): Promise<ExecutionResult> {
  const timeLimitMs = options.timeLimitMs || DEFAULT_LIMITS.TIME_LIMIT_MS;
  const compileTimeoutMs =
    options.compileTimeoutMs || DEFAULT_LIMITS.COMPILE_TIMEOUT_MS;
  const memoryLimitMb = options.memoryLimitMb || DEFAULT_LIMITS.MEMORY_LIMIT_MB;
  const memoryBytes = memoryLimitMb * 1024 * 1024;

  const isCompiled = COMPILED_LANGUAGES.includes(options.language);
  const effectiveTimeLimitMs = isCompiled
    ? timeLimitMs + compileTimeoutMs
    : timeLimitMs;

  const imageName = DOCKER_IMAGES[options.language];
  if (!imageName) {
    throw new Error(`${EVALUATION_MESSAGES.UNSUPPORTED_LANGUAGE}: ${options.language}`);
  }

  const base64Code = Buffer.from(options.code).toString("base64");
  const { cmd } = getSafeLanguageCmd(options.language, base64Code);

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
      MemorySwap: memoryBytes,
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
        } catch {
        }
        reject(new Error(EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG));
      }, effectiveTimeLimitMs);

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

    if (
      isCompiled &&
      exitCode === COMPILE_ERROR_EXIT_CODE &&
      stderr.includes(COMPILE_ERROR_MARKER)
    ) {
      return {
        stdout: "",
        stderr: stderr.replace(COMPILE_ERROR_MARKER, "").trim(),
        exitCode,
        timeMs: executionTimeMs,
        memoryMb,
        timedOut: false,
      };
    }

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

function getSafeLanguageCmd(
  language: ProgrammingLanguage,
  base64Code: string
): { cmd: string[] } {
  switch (language) {
    case "python":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${base64Code}" | base64 -d > user_code.py && cat << 'EOF' > solution.py
import sys
try:
    import user_code
except Exception as e:
    pass

import json
input_data = sys.stdin.read().strip()
if input_data:
    try:
        # Check if Solution class exists
        if hasattr(user_code, 'Solution'):
            sol = user_code.Solution()
            # Try parsing json array or primitive
            try:
                parsed = json.loads(input_data)
                # Find first method in Solution
                methods = [m for m in dir(sol) if not m.startswith('__') and callable(getattr(sol, m))]
                if methods:
                    res = getattr(sol, methods[0])(parsed)
                    print(json.dumps(res) if isinstance(res, (list, dict)) else res)
                else:
                    exec(open('user_code.py').read())
            except:
                exec(open('user_code.py').read())
        else:
            exec(open('user_code.py').read())
    except Exception as err:
        print(err, file=sys.stderr)
else:
    exec(open('user_code.py').read())
EOF
python3 solution.py`,
        ],
      };
    case "javascript":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${base64Code}" | base64 -d > solution.js && node solution.js`,
        ],
      };
    case "cpp":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${base64Code}" | base64 -d > user_code.cpp && cat << 'EOF' > solution.cpp
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include <cctype>
using namespace std;

#include "user_code.cpp"

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    string line;
    vector<int> nums;
    while (getline(cin, line)) {
        if (line.empty()) continue;
        string numStr;
        for (char c : line) {
            if (isdigit(c) || c == '-') {
                numStr += c;
            } else if (!numStr.empty()) {
                try { nums.push_back(stoi(numStr)); } catch(...) {}
                numStr.clear();
            }
        }
        if (!numStr.empty()) {
            try { nums.push_back(stoi(numStr)); } catch(...) {}
        }
    }

    if (nums.empty()) {
        cerr << "Error: no valid input numbers parsed from stdin" << endl;
        return 1;
    }

    Solution sol;
    cout << sol.maxSubArray(nums) << endl;
    return 0;
}
EOF
g++ -O2 -I. solution.cpp -o solution 2> /tmp/compile_err.txt
if [ $? -ne 0 ]; then
  echo "COMPILATION_ERROR" >&2
  cat /tmp/compile_err.txt >&2
  exit 99
fi
./solution`,
        ],
      };
    case "java":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${base64Code}" | base64 -d > Solution.java && javac Solution.java 2> /tmp/compile_err.txt
if [ $? -ne 0 ]; then
  echo "COMPILATION_ERROR" >&2
  cat /tmp/compile_err.txt >&2
  exit 99
fi
java Solution`,
        ],
      };
    default:
      throw new Error(`${EVALUATION_MESSAGES.UNSUPPORTED_LANGUAGE}: ${language}`);
  }
}