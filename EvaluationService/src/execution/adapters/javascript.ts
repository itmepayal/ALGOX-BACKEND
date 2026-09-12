import { resolveJudgeMeta } from "../detectMode";
import { JudgeMeta, PreparedExecution } from "../types";

export function prepareJavaScriptSource(
  userCode: string,
  meta?: JudgeMeta
): PreparedExecution {
  const resolved = resolveJudgeMeta(userCode, "javascript", meta);

  if (resolved.mode === "program") {
    return {
      language: "javascript",
      mode: "program",
      entryFile: "main.js",
      files: { "main.js": userCode },
      runCmd: "node main.js",
      summary: "javascript/program",
    };
  }

  const fnName = resolved.functionName || "solution";
  const cls = resolved.className || "Solution";

  const runner = `const fs = require("fs");
const vm = require("vm");

const code = fs.readFileSync("./user_code.js", "utf8");
const stdinData = fs.readFileSync(0, "utf8").trim();

const sandbox = {
  console,
  require,
  module: { exports: {} },
  exports: {},
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Map,
  Set,
  Math,
  JSON,
  Array,
  String,
  Number,
  Boolean,
  Object,
  parseInt,
  parseFloat,
  isNaN,
  Infinity,
};

vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { timeout: 5000 });
} catch (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}

function pickFn() {
  const preferred = ${JSON.stringify(fnName)};
  const className = ${JSON.stringify(cls)};

  if (typeof sandbox[className] === "function") {
    try {
      const sol = new sandbox[className]();
      if (typeof sol[preferred] === "function") return sol[preferred].bind(sol);
      const proto = Object.getPrototypeOf(sol);
      const methods = Object.getOwnPropertyNames(proto).filter((m) => m !== "constructor");
      if (methods.length) return sol[methods[0]].bind(sol);
    } catch (_) {}
  }

  if (typeof sandbox[preferred] === "function") return sandbox[preferred];

  const keys = Object.keys(sandbox).filter(
    (k) =>
      typeof sandbox[k] === "function" &&
      !["console", "require", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "Buffer", "Map", "Set", "Math", "JSON", "Array", "String", "Number", "Boolean", "Object", "parseInt", "parseFloat", "isNaN"].includes(k)
  );
  if (keys.length) return sandbox[keys[0]];
  if (sandbox.module && sandbox.module.exports) {
    const exp = sandbox.module.exports;
    if (typeof exp === "function") return exp;
    if (exp && typeof exp[preferred] === "function") return exp[preferred];
  }
  return null;
}

const fn = pickFn();
if (!fn) {
  console.error("No callable solution found");
  process.exit(1);
}

const lines = stdinData.split("\\n").map((l) => l.trim()).filter((l) => l.length);
const args = lines.map((l) => {
  try { return JSON.parse(l); } catch (_) { return l; }
});

try {
  let res;
  try {
    res = fn(...args);
  } catch (err) {
    res = fn(args[0]);
  }
  if (res !== undefined) {
    if (typeof res === "boolean") console.log(res ? "true" : "false");
    else if (typeof res === "object") console.log(JSON.stringify(res));
    else console.log(res);
  }
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
`;

  return {
    language: "javascript",
    mode: "function",
    entryFile: "runner.js",
    files: {
      "user_code.js": userCode,
      "runner.js": runner,
    },
    runCmd: "node runner.js",
    summary: `javascript/function ${fnName}`,
  };
}
