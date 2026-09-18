/**
 * Static code analysis — NEVER executes user code.
 * Heuristic complexity / quality / performance signals from source text only.
 */

export type AnalysisLanguage = "python" | "javascript" | "cpp" | "java";

export type AnalysisFinding = {
  id: string;
  category: "complexity" | "quality" | "performance" | "structure";
  severity: "info" | "warning" | "hint";
  title: string;
  detail: string;
  evidence: string;
};

export type CodeAnalysisResult = {
  language: AnalysisLanguage;
  lineCount: number;
  charCount: number;
  findings: AnalysisFinding[];
  complexity: {
    estimate: string | null;
    signal: string;
  };
  qualityScore: number | null;
  explanation: string;
  executed: false;
  note: string;
};

function countMatches(src: string, re: RegExp): number {
  const m = src.match(re);
  return m ? m.length : 0;
}

function detectNestedLoops(src: string): boolean {
  // Crude nested-loop heuristic across languages (no /s flag — older TS targets)
  const patterns = [
    /for\s*\([^)]*\)\s*\{[\s\S]*?for\s*\(/,
    /for\s+\w+\s+in\s+.+:\s*\n(?:[ \t]+.+\n)*[ \t]+for\s+\w+\s+in\s+/m,
    /while\s*\([^)]*\)\s*\{[\s\S]*?while\s*\(/,
    /for\s*\([^)]*\)\s*\{[\s\S]*?while\s*\(/,
  ];
  return patterns.some((p) => p.test(src));
}

function detectRecursion(src: string, language: AnalysisLanguage): boolean {
  if (language === "python") {
    return /def\s+(\w+)\s*\([^)]*\):[\s\S]*?\b\1\s*\(/.test(src);
  }
  if (language === "javascript") {
    return /function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?\b\1\s*\(/.test(src)
      || /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>[\s\S]*?\b\1\s*\(/.test(src);
  }
  // cpp / java — look for method-like recursion of common names
  return /(?:int|void|long|bool|string|vector|List|Integer)\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?\b\1\s*\(/.test(
    src
  );
}

export function analyzeCodeStatic(input: {
  code: string;
  language: AnalysisLanguage;
}): CodeAnalysisResult {
  const code = String(input.code || "");
  const language = input.language;
  const lines = code.split(/\r?\n/);
  const findings: AnalysisFinding[] = [];

  if (!code.trim()) {
    return {
      language,
      lineCount: 0,
      charCount: 0,
      findings: [
        {
          id: "empty",
          category: "structure",
          severity: "info",
          title: "Empty buffer",
          detail: "No code to analyze.",
          evidence: "length=0",
        },
      ],
      complexity: {
        estimate: null,
        signal: "insufficient code",
      },
      qualityScore: null,
      explanation:
        "Paste a solution to receive static complexity and quality hints. Code is never executed for this analysis.",
      executed: false,
      note: "Static analysis only — EvaluationService remains the sole execution authority",
    };
  }

  const nested = detectNestedLoops(code);
  const recursive = detectRecursion(code, language);
  const hasSort = /\.sort\s*\(|sorted\s*\(|Arrays\.sort|Collections\.sort|std::sort/.test(
    code
  );
  const hasMap =
    /HashMap|unordered_map|dict\s*\(|Map\s*<|new Map\b|\{\s*\}/.test(code) ||
    (language === "python" && /\bdict\b|\{\s*[^}]*:\s*/.test(code));
  const todos = countMatches(code, /\bTODO\b|\bFIXME\b/gi);
  const longLines = lines.filter((l) => l.length > 120).length;
  const emptyCatch =
    countMatches(code, /catch\s*\([^)]*\)\s*\{\s*\}/g) +
    countMatches(code, /except\s*:\s*\n\s*pass\b/g);

  let estimate: string | null = "O(n) (heuristic)";
  if (nested && hasSort) estimate = "O(n² log n) or worse (heuristic)";
  else if (nested) estimate = "O(n²) (heuristic)";
  else if (hasSort) estimate = "O(n log n) (heuristic)";
  else if (recursive) estimate = "Depends on recursion depth (heuristic)";
  else if (hasMap) estimate = "O(n) average with hash map (heuristic)";

  if (nested) {
    findings.push({
      id: "nested_loops",
      category: "complexity",
      severity: "warning",
      title: "Nested loops detected",
      detail:
        "Nested iteration often implies quadratic time. Confirm against constraints.",
      evidence: "pattern: nested for/while",
    });
  }
  if (recursive) {
    findings.push({
      id: "recursion",
      category: "complexity",
      severity: "hint",
      title: "Recursive structure",
      detail:
        "Recursion may be elegant but watch stack depth and overlapping subproblems.",
      evidence: "self-call pattern",
    });
  }
  if (hasSort) {
    findings.push({
      id: "sort",
      category: "performance",
      severity: "info",
      title: "Sorting used",
      detail: "Sorting typically contributes O(n log n).",
      evidence: "sort/sorted call",
    });
  }
  if (todos > 0) {
    findings.push({
      id: "todo",
      category: "quality",
      severity: "warning",
      title: "TODO/FIXME markers",
      detail: `Found ${todos} unfinished marker(s).`,
      evidence: `count=${todos}`,
    });
  }
  if (longLines > 0) {
    findings.push({
      id: "long_lines",
      category: "quality",
      severity: "info",
      title: "Long lines",
      detail: `${longLines} line(s) exceed 120 characters.`,
      evidence: `longLines=${longLines}`,
    });
  }
  if (emptyCatch > 0) {
    findings.push({
      id: "empty_catch",
      category: "quality",
      severity: "warning",
      title: "Empty error handlers",
      detail: "Swallowing errors hides failures during debugging.",
      evidence: `emptyHandlers=${emptyCatch}`,
    });
  }

  // Simple quality score from findings (not invented performance metrics)
  let quality = 100;
  for (const f of findings) {
    if (f.severity === "warning") quality -= 12;
    if (f.severity === "hint") quality -= 4;
    if (f.severity === "info") quality -= 2;
  }
  quality = Math.max(0, Math.min(100, quality));

  const explanation = [
    `Static review of ${lines.length} line(s) of ${language}.`,
    estimate
      ? `Heuristic time complexity signal: ${estimate}.`
      : "No complexity signal derived.",
    findings.length
      ? `Raised ${findings.length} finding(s) from source patterns only.`
      : "No notable static findings.",
    "This analysis does not run your code; use Run/Submit for sandboxed execution.",
  ].join(" ");

  return {
    language,
    lineCount: lines.length,
    charCount: code.length,
    findings,
    complexity: {
      estimate,
      signal: "derived from static patterns only — not measured runtime",
    },
    qualityScore: quality,
    explanation,
    executed: false,
    note: "Static analysis only — EvaluationService remains the sole execution authority",
  };
}
