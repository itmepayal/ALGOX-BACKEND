/**
 * Public problem projection — entitlement + FREE Learning Sheet membership
 * decide what content is returned. Client hiding is never the security boundary.
 *
 * Access rule:
 *   IF problem ∈ PUBLISHED FREE Learning Sheet → FREE solving payload
 *   ELSE IF user has premium.problems → PREMIUM access
 *   ELSE → metadata-only lock (accessLocked)
 */
import { IProblem } from "../models/problem.model";
import {
  hasFeature,
  type EntitlementSnapshot,
} from "./entitlementClient";
import { problemIsEffectivelyPremium } from "./sheetFreeAccess";

export type PublicProblemViewOpts = {
  entitlements: EntitlementSnapshot;
  /** Problem ObjectIds that belong to published FREE Learning Sheets. */
  freeSheetProblemIds?: Set<string>;
};

/** Legacy flag / resource-level premium (admin denormalized). */
export function problemIsPremiumFlag(problem: any): boolean {
  if (Boolean(problem?.isPremium)) return true;
  const resources = Array.isArray(problem?.resources) ? problem.resources : [];
  return resources.some((r: any) => Boolean(r?.isPremium));
}

/**
 * Authoritative premium classification for solving access.
 * Prefers sheet membership when the free-sheet set is provided.
 */
export function problemIsPremium(
  problem: any,
  freeSheetProblemIds?: Set<string>
): boolean {
  const id = String(problem?.id || problem?._id || "");
  if (freeSheetProblemIds) {
    return problemIsEffectivelyPremium(id, freeSheetProblemIds);
  }
  // Fallback when set not loaded (should be rare) — use denormalized flag
  return problemIsPremiumFlag(problem);
}

/**
 * Strip hidden testcases + always-private fields, then apply premium redaction.
 */
export function filterPublicProblem(
  problem: IProblem | Record<string, unknown>,
  opts?: PublicProblemViewOpts
): Record<string, unknown> {
  const entitlements = opts?.entitlements || {
    accessTier: "GUEST" as const,
    features: new Set<string>(),
  };
  const pObj: any = (problem as any).toObject
    ? (problem as any).toObject()
    : { ...problem };

  const problemId = String(pObj.id || pObj._id || "");
  const isSheetFree = Boolean(
    opts?.freeSheetProblemIds &&
      problemId &&
      opts.freeSheetProblemIds.has(problemId)
  );
  const isPremium = problemIsPremium(pObj, opts?.freeSheetProblemIds);
  pObj.isPremium = isPremium;
  pObj.isSheetFree = isSheetFree;
  pObj.access = isPremium ? "PREMIUM" : "FREE";
  if (!pObj.id && pObj._id) {
    pObj.id = String(pObj._id);
  }

  // Never expose judge reference solutions on public APIs
  delete pObj.referenceSolutions;

  if (Array.isArray(pObj.testcases)) {
    const all = pObj.testcases as any[];
    pObj.publicTestcaseCount = all.filter((tc) => !tc.isHidden).length;
    pObj.hiddenTestcaseCount = all.filter((tc) => Boolean(tc.isHidden)).length;
    pObj.totalTestcaseCount = all.length;
    pObj.testcases = all.filter((tc) => !tc.isHidden);
  } else {
    pObj.publicTestcaseCount = 0;
    pObj.hiddenTestcaseCount = 0;
    pObj.totalTestcaseCount = 0;
  }

  pObj.likeCount = Math.max(0, Number(pObj.likeCount) || 0);
  pObj.dislikeCount = Math.max(0, Number(pObj.dislikeCount) || 0);
  pObj.bookmarkCount = Math.max(0, Number(pObj.bookmarkCount) || 0);

  const canProblems = hasFeature(entitlements, "premium.problems");
  const canEditorial = hasFeature(entitlements, "premium.editorial");
  const canHints = hasFeature(entitlements, "premium.hints");

  // Premium problem without entitlement → metadata-only teaser
  if (isPremium && !canProblems) {
    return lockPremiumProblem(pObj);
  }

  // Free (or entitled premium) solving payload — still gate editorial/hints
  if (!canEditorial) {
    delete pObj.editorial;
    pObj.editorialLocked = true;
  }
  if (!canHints) {
    pObj.hints = [];
    pObj.hintsLocked = true;
  }

  if (Array.isArray(pObj.resources)) {
    pObj.resources = pObj.resources.map((r: any) => {
      if (r?.isPremium && !canProblems) {
        return {
          type: r.type,
          label: r.label || "Premium resource",
          isPremium: true,
          locked: true,
        };
      }
      return {
        type: r.type,
        url: r.url,
        label: r.label,
        isPremium: Boolean(r.isPremium),
      };
    });
  }

  pObj.accessLocked = false;
  return pObj;
}

/** What FREE/GUEST may see for a premium-classified problem. */
function lockPremiumProblem(pObj: any): Record<string, unknown> {
  return {
    id: pObj.id || (pObj._id ? String(pObj._id) : undefined),
    _id: pObj._id ? String(pObj._id) : undefined,
    title: pObj.title,
    slug: pObj.slug,
    difficulty: pObj.difficulty,
    category: pObj.category,
    tags: Array.isArray(pObj.tags) ? pObj.tags : [],
    status: pObj.status,
    isPremium: true,
    isSheetFree: false,
    access: "PREMIUM",
    accessLocked: true,
    likeCount: pObj.likeCount || 0,
    dislikeCount: pObj.dislikeCount || 0,
    bookmarkCount: pObj.bookmarkCount || 0,
    createdAt: pObj.createdAt,
    updatedAt: pObj.updatedAt,
    // Explicit empties so clients don't use stale cache fields
    description: "",
    editorial: undefined,
    hints: [],
    examples: [],
    constraints: undefined,
    codeStubs: [],
    starterCode: undefined,
    testcases: [],
    publicTestcaseCount: 0,
    hiddenTestcaseCount: 0,
    totalTestcaseCount: 0,
    resources: [],
    videoUrl: undefined,
    articleUrl: undefined,
    practiceUrl: undefined,
    editorialLocked: true,
    hintsLocked: true,
  };
}

import { ForbiddenError } from "./errors/app.error";

export class PremiumRequiredError extends ForbiddenError {
  constructor(
    message = "This feature requires an active premium subscription.",
    details?: Record<string, unknown>
  ) {
    super(message, {
      code: "PREMIUM_REQUIRED",
      feature: "premium.problems",
      ...details,
    });
    this.name = "PremiumRequiredError";
  }
}
