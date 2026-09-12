import { resolveJudgeMeta } from "../detectMode";
import { JudgeMeta, JudgeParameter, PreparedExecution } from "../types";

function javaReadParam(p: JudgeParameter, index: number): string {
  const v = `arg${index}`;
  switch (p.type) {
    case "int":
      return `        int ${v} = Integer.parseInt(lines.get(${index}).trim());`;
    case "long":
    case "long long":
      return `        long ${v} = Long.parseLong(lines.get(${index}).trim());`;
    case "double":
    case "float":
      return `        double ${v} = Double.parseDouble(lines.get(${index}).trim());`;
    case "bool":
      return `        boolean ${v} = Boolean.parseBoolean(lines.get(${index}).trim());`;
    case "string":
      return `        String ${v} = stripQuotes(lines.get(${index}).trim());`;
    case "vector<int>":
      return `        int[] ${v} = parseIntArray(lines.get(${index}));`;
    case "vector<string>":
      return `        String[] ${v} = parseStringArray(lines.get(${index}));`;
    case "vector<vector<int>>":
      return `        int[][] ${v} = parseIntMatrix(lines.get(${index}));`;
    default:
      return `        int[] ${v} = parseIntArray(lines.get(${index}));`;
  }
}

function javaPrintReturn(returnType: string | undefined): string {
  const t = returnType || "any";
  if (t === "vector<int>" || t === "int[]") {
    return `        System.out.println(formatIntArray(result));`;
  }
  if (t === "bool" || t === "boolean") {
    return `        System.out.println(result ? "true" : "false");`;
  }
  if (t === "vector<string>" || t === "String[]") {
    return `        System.out.println(formatStringArray(result));`;
  }
  return `        System.out.println(result);`;
}

function javaResultType(returnType: string | undefined): string {
  switch (returnType) {
    case "vector<int>":
      return "int[]";
    case "vector<string>":
      return "String[]";
    case "vector<vector<int>>":
      return "int[][]";
    case "bool":
      return "boolean";
    case "int":
      return "int";
    case "long":
    case "long long":
      return "long";
    case "double":
      return "double";
    case "string":
      return "String";
    default:
      return "Object";
  }
}

export function prepareJavaSource(
  userCode: string,
  meta?: JudgeMeta
): PreparedExecution {
  const resolved = resolveJudgeMeta(userCode, "java", meta);

  if (resolved.mode === "program") {
    // Ensure public class name matches file — LeetCode often uses class Solution with main.
    const publicClass = userCode.match(/public\s+class\s+(\w+)/)?.[1] || "Solution";
    return {
      language: "java",
      mode: "program",
      entryFile: `${publicClass}.java`,
      files: { [`${publicClass}.java`]: userCode },
      compileCmd: `javac ${publicClass}.java`,
      runCmd: `java ${publicClass}`,
      summary: `java/program ${publicClass}`,
    };
  }

  const fn = resolved.functionName || "solve";
  const cls = resolved.className || "Solution";
  const params = resolved.parameters || [{ name: "nums", type: "vector<int>" as const }];
  const resultType = javaResultType(String(resolved.returnType || "any"));

  // Strip a user-provided main to avoid conflicts — but prefer detection above.
  let solutionSrc = userCode;
  if (!/class\s+Solution\b/.test(solutionSrc) && cls === "Solution") {
    solutionSrc = `class Solution {\n${userCode}\n}`;
  }

  const reads = params.map((p, i) => javaReadParam(p, i)).join("\n");
  const args = params.map((_, i) => `arg${i}`).join(", ");

  const mainSrc = `import java.util.*;
import java.io.*;

public class Main {
    static String stripQuotes(String s) {
        s = s.trim();
        if (s.length() >= 2 && ((s.charAt(0) == '"' && s.charAt(s.length()-1) == '"') || (s.charAt(0) == '\\'' && s.charAt(s.length()-1) == '\\''))) {
            return s.substring(1, s.length() - 1);
        }
        return s;
    }

    static int[] parseIntArray(String line) {
        ArrayList<Integer> list = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (Character.isDigit(c) || c == '-') cur.append(c);
            else if (cur.length() > 0) {
                list.add(Integer.parseInt(cur.toString()));
                cur.setLength(0);
            }
        }
        if (cur.length() > 0) list.add(Integer.parseInt(cur.toString()));
        int[] arr = new int[list.size()];
        for (int i = 0; i < list.size(); i++) arr[i] = list.get(i);
        return arr;
    }

    static String[] parseStringArray(String line) {
        ArrayList<String> list = new ArrayList<>();
        boolean in = false;
        char q = 0;
        StringBuilder cur = new StringBuilder();
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (!in && (c == '"' || c == '\\'')) { in = true; q = c; cur.setLength(0); continue; }
            if (in && c == q) { list.add(cur.toString()); in = false; continue; }
            if (in) cur.append(c);
        }
        return list.toArray(new String[0]);
    }

    static int[][] parseIntMatrix(String line) {
        ArrayList<int[]> rows = new ArrayList<>();
        int depth = 0;
        int start = -1;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '[') {
                depth++;
                if (depth == 2) start = i;
            } else if (c == ']') {
                if (depth == 2 && start >= 0) {
                    rows.add(parseIntArray(line.substring(start, i + 1)));
                    start = -1;
                }
                depth--;
            }
        }
        return rows.toArray(new int[0][]);
    }

    static String formatIntArray(int[] arr) {
        StringBuilder sb = new StringBuilder();
        sb.append('[');
        for (int i = 0; i < arr.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(arr[i]);
        }
        sb.append(']');
        return sb.toString();
    }

    static String formatStringArray(String[] arr) {
        StringBuilder sb = new StringBuilder();
        sb.append('[');
        for (int i = 0; i < arr.length; i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(arr[i]).append('"');
        }
        sb.append(']');
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        ArrayList<String> lines = new ArrayList<>();
        String line;
        while ((line = br.readLine()) != null) lines.add(line);
        while (lines.size() < ${params.length}) lines.add("");

${reads}

        ${cls} sol = new ${cls}();
        ${resultType} result = sol.${fn}(${args});
${javaPrintReturn(String(resolved.returnType || "any"))}
    }
}
`;

  return {
    language: "java",
    mode: "function",
    entryFile: "Main.java",
    files: {
      "Solution.java": solutionSrc,
      "Main.java": mainSrc,
    },
    compileCmd: "javac Solution.java Main.java",
    runCmd: "java Main",
    summary: `java/function ${cls}.${fn}`,
  };
}
