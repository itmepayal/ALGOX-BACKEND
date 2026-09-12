import { resolveJudgeMeta } from "../detectMode";
import { JudgeMeta, PreparedExecution } from "../types";

export function preparePythonSource(
  userCode: string,
  meta?: JudgeMeta
): PreparedExecution {
  const resolved = resolveJudgeMeta(userCode, "python", meta);

  if (resolved.mode === "program") {
    return {
      language: "python",
      mode: "program",
      entryFile: "main.py",
      files: { "main.py": userCode },
      runCmd: "python3 main.py",
      summary: "python/program",
    };
  }

  const fn = resolved.functionName || "solve";
  const cls = resolved.className || "Solution";

  const runner = `import sys, json, inspect, importlib.util

spec = importlib.util.spec_from_file_location("user_code", "user_code.py")
user_code = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(user_code)
except Exception:
    import traceback
    traceback.print_exc()
    sys.exit(1)

stdin_data = sys.stdin.read().strip()

def parse_line(l):
    try:
        return json.loads(l)
    except Exception:
        low = l.lower()
        if low == "true":
            return True
        if low == "false":
            return False
        return l

args = [parse_line(l) for l in stdin_data.split("\\n") if l.strip() != ""]

fn = None
preferred = ${JSON.stringify(fn)}
class_name = ${JSON.stringify(cls)}

if hasattr(user_code, class_name):
    sol = getattr(user_code, class_name)()
    if hasattr(sol, preferred):
        fn = getattr(sol, preferred)
    else:
        methods = [m for m in dir(sol) if not m.startswith("_") and callable(getattr(sol, m))]
        if methods:
            fn = getattr(sol, methods[0])

if fn is None:
    candidates = []
    for name, obj in inspect.getmembers(user_code, inspect.isfunction):
        if name.startswith("_"):
            continue
        candidates.append((name, obj))
    for name, obj in candidates:
        if name == preferred:
            fn = obj
            break
    if fn is None and candidates:
        fn = candidates[0][1]

if fn is None:
    raise RuntimeError("No callable solution found")

try:
    try:
        res = fn(*args)
    except TypeError:
        res = fn(args[0] if len(args) == 1 else args)
except Exception:
    import traceback
    traceback.print_exc()
    sys.exit(1)

if res is not None:
    if isinstance(res, bool):
        print("true" if res else "false")
    elif isinstance(res, (list, dict, tuple)):
        print(json.dumps(res, separators=(",", ":")))
    elif isinstance(res, set):
        print(json.dumps(sorted(list(res)), separators=(",", ":")))
    else:
        print(res)
`;

  return {
    language: "python",
    mode: "function",
    entryFile: "runner.py",
    files: {
      "user_code.py": userCode,
      "runner.py": runner,
    },
    runCmd: "python3 runner.py",
    summary: `python/function ${cls}.${fn}`,
  };
}
