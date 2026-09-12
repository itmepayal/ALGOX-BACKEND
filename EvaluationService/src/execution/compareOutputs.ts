/**
 * Type-aware / JSON-aware output comparison for judge verdicts.
 * Never treat objects as React children — this is server-side only.
 */

function stripNoise(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");
}

function tryParseJson(s: string): unknown | undefined {
  const t = s.trim();
  if (!t) return undefined;
  // Normalize Python-ish bools/None for JSON
  const normalized = t
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null");
  try {
    return JSON.parse(normalized);
  } catch {
    // Try wrapping bare tokens
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === "true" || t === "True") return true;
    if (t === "false" || t === "False") return false;
    return undefined;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return Math.abs(a - b) < 1e-6;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.length !== bk.length) return false;
    return ak.every(
      (k, i) =>
        k === bk[i] &&
        deepEqual(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k]
        )
    );
  }

  // bool vs string
  if (typeof a === "boolean" || typeof b === "boolean") {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  return String(a) === String(b);
}

/** Compact JSON without spaces — for formatting actual outputs consistently. */
export function formatJudgeOutput(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Returns true when actual stdout matches expected output under judge rules.
 */
export function outputsMatch(actual: string, expected: string): boolean {
  const a = stripNoise(actual ?? "");
  const e = stripNoise(expected ?? "");

  if (a === e) return true;

  // Ignore all whitespace differences for bracket-heavy outputs
  const compact = (s: string) => s.replace(/\s+/g, "");
  if (compact(a) === compact(e)) return true;

  const pa = tryParseJson(a);
  const pe = tryParseJson(e);
  if (pa !== undefined && pe !== undefined) {
    return deepEqual(pa, pe);
  }

  // Numeric string compare
  if (/^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(e)) {
    return Math.abs(Number(a) - Number(e)) < 1e-6;
  }

  return false;
}

export function normalizeOutputString(str: string): string {
  return stripNoise(str);
}
