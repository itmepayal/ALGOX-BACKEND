import {
  hasBitsHeader,
  hasUsingNamespaceStd,
  resolveJudgeMeta,
} from "../detectMode";
import { JudgeMeta, JudgeParameter, PreparedExecution } from "../types";

const CPP_HELPERS = `
static string trim(const string& s) {
    size_t a = 0, b = s.size();
    while (a < b && isspace(static_cast<unsigned char>(s[a]))) a++;
    while (b > a && isspace(static_cast<unsigned char>(s[b - 1]))) b--;
    return s.substr(a, b - a);
}

static long long parseIntegerToken(const string& s) {
    return stoll(trim(s));
}

static vector<long long> parseNumberArray(const string& line) {
    vector<long long> nums;
    string cur;
    for (char c : line) {
        if ((c >= '0' && c <= '9') || c == '-') {
            cur.push_back(c);
        } else if (!cur.empty()) {
            try { nums.push_back(stoll(cur)); } catch (...) {}
            cur.clear();
        }
    }
    if (!cur.empty()) {
        try { nums.push_back(stoll(cur)); } catch (...) {}
    }
    return nums;
}

static vector<int> toIntVec(const vector<long long>& src) {
    vector<int> out;
    out.reserve(src.size());
    for (auto v : src) out.push_back(static_cast<int>(v));
    return out;
}

static string parseQuotedString(const string& line) {
    string t = trim(line);
    if (t.size() >= 2 && ((t.front() == '"' && t.back() == '"') || (t.front() == '\\'' && t.back() == '\\''))) {
        return t.substr(1, t.size() - 2);
    }
    return t;
}

static vector<string> parseStringArray(const string& line) {
    vector<string> out;
    bool in = false;
    char quote = 0;
    string cur;
    for (size_t i = 0; i < line.size(); ++i) {
        char c = line[i];
        if (!in && (c == '"' || c == '\\'')) { in = true; quote = c; cur.clear(); continue; }
        if (in && c == quote) { out.push_back(cur); in = false; continue; }
        if (in) cur.push_back(c);
    }
    return out;
}

static vector<vector<int>> parseIntMatrix(istream& in, string firstLine) {
    vector<vector<int>> mat;
    string line = firstLine;
    // Single-line matrix: [[1,2],[3,4]]
    if (count(line.begin(), line.end(), '[') >= 2) {
        string inner = line;
        size_t i = 0;
        while (i < inner.size()) {
            if (inner[i] == '[') {
                size_t j = inner.find(']', i + 1);
                if (j == string::npos) break;
                mat.push_back(toIntVec(parseNumberArray(inner.substr(i, j - i + 1))));
                i = j + 1;
            } else i++;
        }
        // Drop outer wrapper empty first if double-wrapped poorly
        if (!mat.empty() && mat[0].empty() && mat.size() > 1) mat.erase(mat.begin());
        return mat;
    }
    mat.push_back(toIntVec(parseNumberArray(line)));
    while (getline(in, line)) {
        if (trim(line).empty()) continue;
        mat.push_back(toIntVec(parseNumberArray(line)));
    }
    return mat;
}

template <typename T>
static void printValue(const T& v) { cout << v; }

static void printValue(int v) { cout << v; }
static void printValue(long long v) { cout << v; }
static void printValue(double v) { cout << v; }
static void printValue(bool v) { cout << (v ? "true" : "false"); }
static void printValue(const string& v) { cout << v; }

static void printValue(const vector<int>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) cout << ",";
        cout << v[i];
    }
    cout << "]";
}

static void printValue(const vector<long long>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) cout << ",";
        cout << v[i];
    }
    cout << "]";
}

static void printValue(const vector<string>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) cout << ",";
        cout << "\\"" << v[i] << "\\"";
    }
    cout << "]";
}

static void printValue(const vector<vector<int>>& v) {
    cout << "[";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) cout << ",";
        printValue(v[i]);
    }
    cout << "]";
}

static void printValue(const pair<int,int>& p) {
    cout << "[" << p.first << "," << p.second << "]";
}
`;

function emitReadParam(p: JudgeParameter, index: number): string {
  const varName = `arg${index}`;
  const type = p.type;
  switch (type) {
    case "int":
      return `    int ${varName}; { auto tmp = parseNumberArray(lines[${index}]); ${varName} = tmp.empty() ? 0 : static_cast<int>(tmp[0]); }`;
    case "long":
    case "long long":
      return `    long long ${varName}; { auto tmp = parseNumberArray(lines[${index}]); ${varName} = tmp.empty() ? 0 : tmp[0]; }`;
    case "double":
    case "float":
      return `    double ${varName} = stod(trim(lines[${index}]));`;
    case "bool": {
      return `    bool ${varName}; { string t = trim(lines[${index}]); ${varName} = (t == "true" || t == "True" || t == "1"); }`;
    }
    case "string":
    case "char":
      return `    string ${varName} = parseQuotedString(lines[${index}]);`;
    case "vector<int>":
      return `    vector<int> ${varName} = toIntVec(parseNumberArray(lines[${index}]));`;
    case "vector<long long>":
      return `    vector<long long> ${varName} = parseNumberArray(lines[${index}]);`;
    case "vector<string>":
      return `    vector<string> ${varName} = parseStringArray(lines[${index}]);`;
    case "vector<vector<int>>":
      return `    vector<vector<int>> ${varName} = parseIntMatrix(cin, lines[${index}]);`;
    default:
      return `    vector<int> ${varName} = toIntVec(parseNumberArray(lines[${index}]));`;
  }
}

function emitCallArgs(params: JudgeParameter[]): string {
  return params.map((_, i) => `arg${i}`).join(", ");
}

function emitReturnPrint(returnType: string | undefined, expr: string): string {
  const t = returnType || "any";
  if (t === "void" || t === "None") {
    return `    ${expr};\n`;
  }
  return `    {
        auto __res = ${expr};
        printValue(__res);
        cout << endl;
    }
`;
}

export function prepareCppSource(
  userCode: string,
  meta?: JudgeMeta
): PreparedExecution {
  const resolved = resolveJudgeMeta(userCode, "cpp", meta);
  const mode = resolved.mode;

  if (mode === "program") {
    // Full-program mode: do not inject main or duplicate headers aggressively.
    let source = userCode;
    // If they forgot common includes but use STL without bits — leave as-is (user owns includes).
    return {
      language: "cpp",
      mode: "program",
      entryFile: "solution.cpp",
      files: { "solution.cpp": source },
      compileCmd: "g++ -O2 -std=c++17 -pipe solution.cpp -o solution",
      runCmd: "./solution",
      summary: "cpp/program (user main)",
    };
  }

  const params = resolved.parameters || [{ name: "nums", type: "vector<int>" as const }];
  const fn = resolved.functionName || "solution";
  const cls = resolved.className || "Solution";

  const preludeParts: string[] = [];
  if (!hasBitsHeader(userCode)) {
    preludeParts.push("#include <bits/stdc++.h>");
  }
  if (!hasUsingNamespaceStd(userCode)) {
    preludeParts.push("using namespace std;");
  }
  const prelude = preludeParts.length ? preludeParts.join("\n") + "\n\n" : "";

  const readBlock = params.map((p, i) => emitReadParam(p, i)).join("\n");
  const hasClass = /\bclass\s+Solution\b/.test(userCode);
  const callExpr = hasClass
    ? `sol.${fn}(${emitCallArgs(params)})`
    : `${fn}(${emitCallArgs(params)})`;
  const callBlock = hasClass
    ? `    ${cls} sol;\n${emitReturnPrint(String(resolved.returnType || "any"), callExpr)}`
    : emitReturnPrint(String(resolved.returnType || "any"), callExpr);

  const driver = `
${CPP_HELPERS}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    vector<string> lines;
    string line;
    while (getline(cin, line)) {
        lines.push_back(line);
    }
    while (lines.size() < ${params.length}) lines.push_back("");

${readBlock}

${callBlock}
    return 0;
}
`;

  const source = `${prelude}// ---- user code (LeetCode class mode) ----\n${userCode}\n// ---- platform driver ----\n${driver}\n`;

  return {
    language: "cpp",
    mode: "function",
    entryFile: "solution.cpp",
    files: { "solution.cpp": source },
    compileCmd: "g++ -O2 -std=c++17 -pipe solution.cpp -o solution",
    runCmd: "./solution",
    summary: `cpp/function ${cls}.${fn}(${params.map((p) => p.type).join(", ")})`,
  };
}
