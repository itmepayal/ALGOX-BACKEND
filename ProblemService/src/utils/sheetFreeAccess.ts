/**
 * Authoritative FREE problem catalog = membership in a PUBLISHED Learning Sheet
 * with access === "FREE". Everything else requires premium.problems to unlock.
 *
 * Cached briefly to keep list/detail projections cheap. Invalidate on sheet edits.
 */
import mongoose from "mongoose";
import { Sheet } from "../models/sheet.model";
import { SheetProblem } from "../models/sheetProblem.model";

const CACHE_TTL_MS = 60_000;

let cachedIds: Set<string> | null = null;
let cachedAt = 0;
let inflight: Promise<Set<string>> | null = null;

export function invalidateFreeSheetProblemCache(): void {
  cachedIds = null;
  cachedAt = 0;
  inflight = null;
}

export async function getFreeSheetProblemIdSet(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedIds && now - cachedAt < CACHE_TTL_MS) {
    return cachedIds;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const freeSheets = await Sheet.find({
      status: "PUBLISHED",
      access: { $ne: "PREMIUM" },
    })
      .select("sheetId")
      .lean();

    const sheetIds = freeSheets.map((s) => String(s.sheetId));
    if (sheetIds.length === 0) {
      cachedIds = new Set();
      cachedAt = Date.now();
      return cachedIds;
    }

    const rows = await SheetProblem.find({ sheetId: { $in: sheetIds } })
      .select("problem")
      .lean();

    const ids = new Set<string>();
    for (const row of rows) {
      if (row.problem) ids.add(String(row.problem));
    }
    cachedIds = ids;
    cachedAt = Date.now();
    return ids;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function isProblemOnFreeSheet(
  problemId: string
): Promise<boolean> {
  if (!problemId || !mongoose.Types.ObjectId.isValid(problemId)) {
    return false;
  }
  const set = await getFreeSheetProblemIdSet();
  return set.has(String(problemId));
}

/**
 * Effective premium classification for solving access.
 * Sheet membership wins over the denormalized Problem.isPremium flag.
 */
export function problemIsEffectivelyPremium(
  problemId: string | undefined | null,
  freeSheetProblemIds: Set<string>
): boolean {
  if (!problemId) return true;
  return !freeSheetProblemIds.has(String(problemId));
}
