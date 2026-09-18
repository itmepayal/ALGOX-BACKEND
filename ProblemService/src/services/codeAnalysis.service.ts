import {
  analyzeCodeStatic,
  type AnalysisLanguage,
} from "../utils/staticCodeAnalysis";
import {
  resolveEntitlements,
  hasFeature,
} from "../utils/entitlementClient";
import { BadRequestError, ForbiddenError } from "../utils/errors/app.error";

const FEATURE = "premium.code_analysis";
const LANGS = new Set(["python", "javascript", "cpp", "java"]);

export class CodeAnalysisService {
  private async requirePremium(authorization?: string | null) {
    const snap = await resolveEntitlements(authorization);
    if (!hasFeature(snap, FEATURE)) {
      throw new ForbiddenError(
        "Code analysis requires premium.code_analysis"
      );
    }
  }

  async analyze(
    body: { code?: string; language?: string },
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const language = String(body.language || "").toLowerCase();
    if (!LANGS.has(language)) {
      throw new BadRequestError(
        "language must be python, javascript, cpp, or java"
      );
    }
    const code = String(body.code ?? "");
    if (code.length > 64_000) {
      throw new BadRequestError("Code exceeds maximum allowed length");
    }

    // Never call EvaluationService / Docker from this path
    const result = analyzeCodeStatic({
      code,
      language: language as AnalysisLanguage,
    });
    return result;
  }
}

export const codeAnalysisService = new CodeAnalysisService();
