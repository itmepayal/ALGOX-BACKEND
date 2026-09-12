/** Fallback catalog when DB sheets are not yet seeded. */
export const FALLBACK_SHEETS = {
  "striver-a2z": {
    id: "striver-a2z",
    name: "AlgoPath Sheet - Learn DSA from A to Z",
    totalProblems: 192,
  },
} as const;

/** @deprecated Prefer resolveSheetMeta from sheetCatalog — kept for import compatibility. */
export const KNOWN_SHEETS = FALLBACK_SHEETS;

export type KnownSheetId = keyof typeof FALLBACK_SHEETS;

export function isKnownSheetId(sheetId: string): sheetId is KnownSheetId {
  return Object.prototype.hasOwnProperty.call(FALLBACK_SHEETS, sheetId);
}

export const STRIVER_A2Z_SHEET_ID = "striver-a2z";
