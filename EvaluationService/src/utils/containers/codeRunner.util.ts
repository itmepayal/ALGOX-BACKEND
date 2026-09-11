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

  const isCompiled = COMPILED_LANGUAGES.includes(options.language);
  const effectiveTimeLimitMs = isCompiled
    ? timeLimitMs + compileTimeoutMs
    : timeLimitMs;

  // g++ / javac need far more than typical problem runtime limits (e.g. 128MB)
  const containerMemoryMb = isCompiled
    ? Math.max(memoryLimitMb, 512)
    : memoryLimitMb;
  const memoryBytes = containerMemoryMb * 1024 * 1024;

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
    },
  });

  const startTime = Date.now();
  let timedOut = false;

  try {
    const stream = await container.attach({
      stream: true,
      hijack: true,
      stdin: true,
      stdout: true,
      stderr: true,
    });

    await container.start();

    // Give the process a moment to start before writing stdin
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

    // Allow demux to flush leftover stream chunks
    await new Promise((r) => setTimeout(r, 100));

    const executionTimeMs = Date.now() - startTime;
    const stats = await container.stats({ stream: false });
    const memoryMb = Math.round(
      (stats.memory_stats?.usage || 0) / (1024 * 1024)
    );

    // OOM kill
    if (exitCode === 137) {
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
          `echo "${base64Code}" | base64 -d > user_code.py && cat << 'EOF' > runner.py
import sys, json, inspect

try:
    import user_code
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)

stdin_data = sys.stdin.read().strip()

sol_cls = getattr(user_code, 'Solution', None)
user_funcs = [
    obj for name, obj in inspect.getmembers(user_code, inspect.isfunction)
    if obj.__module__ == 'user_code'
]

executed = False
if sol_cls:
    sol = sol_cls()
    methods = [m for m in dir(sol) if not m.startswith('__') and callable(getattr(sol, m))]
    if methods and stdin_data:
        fn = getattr(sol, methods[0])
        lines = [l.strip() for l in stdin_data.split('\n') if l.strip()]
        args = []
        for l in lines:
            try: args.append(json.loads(l))
            except: args.append(l)
        try:
            res = fn(*args)
            if res is not None:
                print(json.dumps(res) if isinstance(res, (list, dict, set, tuple)) else res)
            executed = True
        except TypeError:
            try:
                res = fn(args[0] if len(args) == 1 else args)
                if res is not None:
                    print(json.dumps(res) if isinstance(res, (list, dict, set, tuple)) else res)
                executed = True
            except Exception:
                pass
        except Exception:
            import traceback
            traceback.print_exc()
            sys.exit(1)

if not executed and user_funcs and stdin_data:
    fn = user_funcs[0]
    lines = [l.strip() for l in stdin_data.split('\n') if l.strip()]
    args = []
    for l in lines:
        try: args.append(json.loads(l))
        except: args.append(l)
    try:
        res = fn(*args)
        if res is not None:
            print(json.dumps(res) if isinstance(res, (list, dict, set, tuple)) else res)
        executed = True
    except TypeError:
        try:
            res = fn(args[0] if len(args) == 1 else args)
            if res is not None:
                print(json.dumps(res) if isinstance(res, (list, dict, set, tuple)) else res)
            executed = True
        except Exception:
            pass
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
EOF
python3 runner.py`,
        ],
      };
    case "javascript":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${base64Code}" | base64 -d > user_code.js && cat << 'EOF' > runner.js
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('./user_code.js', 'utf-8');
const stdinData = fs.readFileSync(0, 'utf-8').trim();

const customConsole = {
  log: (...args) => { console.log(...args); },
  error: (...args) => { console.error(...args); },
  warn: (...args) => { console.warn(...args); },
  info: (...args) => { console.info(...args); },
};

const sandbox = {
  console: customConsole,
  require,
  process,
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  exports: {},
  module: { exports: {} }
};

vm.createContext(sandbox);

try {
  vm.runInContext(code, sandbox);
} catch (e) {
  console.error(e);
  process.exit(1);
}

let fn = null;
if (sandbox.Solution && typeof sandbox.Solution === 'function') {
  try {
    const sol = new sandbox.Solution();
    const proto = Object.getPrototypeOf(sol);
    const methods = Object.getOwnPropertyNames(proto).filter(m => m !== 'constructor');
    if (methods.length > 0) fn = sol[methods[0]].bind(sol);
  } catch(e) {}
}

if (!fn) {
  const customKeys = Object.keys(sandbox).filter(k => 
    typeof sandbox[k] === 'function' && 
    !['console', 'require', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Buffer'].includes(k)
  );
  if (customKeys.length > 0) {
    fn = sandbox[customKeys[0]];
  }
}

if (fn && stdinData) {
  try {
    const lines = stdinData.split('\n').map(l => l.trim()).filter(Boolean);
    const args = lines.map(l => {
      try { return JSON.parse(l); } catch(e) { return l; }
    });
    let res;
    try {
      res = fn(...args);
    } catch(err) {
      if (args.length > 0) res = fn(args[0]);
      else throw err;
    }
    if (res !== undefined) {
      console.log(typeof res === 'object' ? JSON.stringify(res) : res);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
EOF
node runner.js`,
        ],
      };
    case "cpp":
      return {
        cmd: [
          "sh",
          "-c",
          `echo "${base64Code}" | base64 -d > user_code.cpp && cat << 'EOF' > runner.sh
if grep -qE "int[[:space:]]+main[[:space:]]*\\(" user_code.cpp; then
  g++ -O2 -std=c++17 user_code.cpp -o solution 2> /tmp/compile_err.txt
  if [ $? -ne 0 ]; then
    echo "COMPILATION_ERROR" >&2
    cat /tmp/compile_err.txt >&2
    exit 99
  fi
  ./solution
else
  cat << 'HEADER' > solution.cpp
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <cctype>
using namespace std;

#include "user_code.cpp"

static vector<int> parseIntArray(const string& line) {
    vector<int> nums;
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
    return nums;
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    string line;
    vector<int> nums;
    int target = 0;
    bool hasTarget = false;
    int lineIdx = 0;

    while (getline(cin, line)) {
        if (line.empty()) continue;
        vector<int> currentNums = parseIntArray(line);
        if (lineIdx == 0) {
            nums = currentNums;
        } else if (lineIdx == 1 && currentNums.size() == 1) {
            target = currentNums[0];
            hasTarget = true;
        }
        lineIdx++;
    }

HEADER

  # Free-function style: int solution(vector<int>& nums)
  if grep -qE "(int|long|long long|bool|double|string|vector<.*>)[[:space:]]+solution[[:space:]]*\\(" user_code.cpp && ! grep -q "class[[:space:]]\\+Solution" user_code.cpp; then
    cat << 'CALL' >> solution.cpp
    cout << solution(nums) << endl;
CALL
  elif grep -q "class[[:space:]]\\+Solution" user_code.cpp || grep -qE "maxSubArray|twoSum|findMax|reverseArray|arraySum|countEven|containsDuplicate" user_code.cpp; then
    cat << 'SOL' >> solution.cpp
    Solution sol;
SOL
    if grep -q "twoSum" user_code.cpp; then
      cat << 'CALL' >> solution.cpp
    auto res = sol.twoSum(nums, target);
    cout << "[" << res[0] << "," << res[1] << "]" << endl;
CALL
    elif grep -q "maxSubArray" user_code.cpp; then
      cat << 'CALL' >> solution.cpp
    cout << sol.maxSubArray(nums) << endl;
CALL
    elif grep -q "findMax" user_code.cpp; then
      cat << 'CALL' >> solution.cpp
    cout << sol.findMax(nums) << endl;
CALL
    elif grep -q "reverseArray" user_code.cpp; then
      cat << 'CALL' >> solution.cpp
    auto res = sol.reverseArray(nums);
    cout << "[";
    for(size_t i=0; i<res.size(); ++i) cout << res[i] << (i+1<res.size()? ",": "");
    cout << "]" << endl;
CALL
    elif grep -q "arraySum" user_code.cpp; then
      cat << 'CALL' >> solution.cpp
    cout << sol.arraySum(nums) << endl;
CALL
    elif grep -q "countEven" user_code.cpp; then
      cat << 'CALL' >> solution.cpp
    cout << sol.countEven(nums) << endl;
CALL
    elif grep -q "containsDuplicate" user_code.cpp; then
      cat << 'CALL' >> solution.cpp
    cout << (sol.containsDuplicate(nums) ? "true" : "false") << endl;
CALL
    else
      cat << 'CALL' >> solution.cpp
    cout << sol.maxSubArray(nums) << endl;
CALL
    fi
  else
    cat << 'CALL' >> solution.cpp
    // Fallback: try free function solution(nums)
    cout << solution(nums) << endl;
CALL
  fi

  cat << 'FOOTER' >> solution.cpp
    return 0;
}
FOOTER
  g++ -O2 -std=c++17 -I. solution.cpp -o solution 2> /tmp/compile_err.txt
  if [ $? -ne 0 ]; then
    echo "COMPILATION_ERROR" >&2
    cat /tmp/compile_err.txt >&2
    exit 99
  fi
  ./solution
fi
EOF
sh runner.sh`,
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
