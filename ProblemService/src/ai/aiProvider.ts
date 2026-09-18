/**
 * LLM provider wrapper. API keys stay server-side only (never returned to client).
 *
 * Default provider: Google Gemini (GEMINI_API_KEY).
 * Optional rollback: AI_PROVIDER=openai + OPENAI_API_KEY.
 *
 * Production-safe: missing/failed provider returns a clear service error —
 * never silent stub text that could be mistaken for a real model reply.
 * Solution-dump refusals are intentional learning policy (not fake LLM output).
 */
import {
  LEARNING_SYSTEM_PROMPT,
  featureInstruction,
  refusalAssistResponse,
  looksLikeSolutionDumpRequest,
} from "./aiPolicy";
import type { AiFeatureId } from "./aiFeatures";
import { ServiceUnavailableError } from "../utils/errors/app.error";

/** Real model | learning-policy refusal | none (failure path in events). */
export type AiProviderName = "gemini" | "openai" | "policy" | "none";

function activeProvider(): "gemini" | "openai" {
  const raw = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
  return raw === "openai" ? "openai" : "gemini";
}

export function getAiProviderConfig() {
  const provider = activeProvider();
  if (provider === "openai") {
    const key = (process.env.OPENAI_API_KEY || "").trim();
    const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
    return {
      configured: Boolean(key),
      model,
      hasKey: Boolean(key),
      provider,
    };
  }
  const key = (process.env.GEMINI_API_KEY || "").trim();
  // Prefer Google "latest" flash alias — versioned 2.x IDs are often blocked for new keys.
  const model = (process.env.GEMINI_MODEL || "gemini-flash-lite-latest").trim();
  return {
    configured: Boolean(key),
    model,
    hasKey: Boolean(key),
    provider,
  };
}

function requireProviderKey(): { provider: "gemini" | "openai"; key: string; model: string } {
  const cfg = getAiProviderConfig();
  if (!cfg.hasKey) {
    const which =
      cfg.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
    throw new ServiceUnavailableError(`BLOCKED — ${which} required`, {
      code: "AI_NOT_CONFIGURED",
    });
  }
  const key =
    cfg.provider === "openai"
      ? (process.env.OPENAI_API_KEY || "").trim()
      : (process.env.GEMINI_API_KEY || "").trim();
  return { provider: cfg.provider as "gemini" | "openai", key, model: cfg.model };
}

function providerFailure(message: string, details?: Record<string, unknown>): never {
  throw new ServiceUnavailableError(message, {
    code: "AI_PROVIDER_UNAVAILABLE",
    ...details,
  });
}

function buildUserContent(args: {
  feature: AiFeatureId;
  problemTitle?: string;
  problemDescription?: string;
  userMessage?: string;
  errorMessage?: string;
  testCase?: string;
  codeSnippet?: string;
  language?: string;
}): string {
  return [
    `Feature: ${args.feature}`,
    featureInstruction(args.feature),
    args.problemTitle ? `Problem title: ${args.problemTitle}` : "",
    args.problemDescription
      ? `Problem (truncated):\n${String(args.problemDescription).slice(0, 4000)}`
      : "",
    args.language ? `Language: ${args.language}` : "",
    args.errorMessage
      ? `Error (truncated):\n${String(args.errorMessage).slice(0, 1500)}`
      : "",
    args.testCase
      ? `Test case (truncated):\n${String(args.testCase).slice(0, 1500)}`
      : "",
    args.codeSnippet
      ? `Learner code snippet (truncated, do not store):\n${String(args.codeSnippet).slice(0, 2500)}`
      : "",
    args.userMessage
      ? `Learner question:\n${String(args.userMessage).slice(0, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function readProviderErrorSnippet(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    // Never return API keys; keep a short provider message only.
    return String(raw || "")
      .replace(/key[=:]\s*["']?[^"'&\s]+/gi, "key=[REDACTED]")
      .slice(0, 240);
  } catch {
    return "";
  }
}

function mapHttpProviderError(
  status: number,
  provider: "gemini" | "openai",
  snippet = ""
): never {
  const lower = snippet.toLowerCase();
  if (status === 401 || status === 403) {
    providerFailure(
      "AlgoPath AI provider rejected credentials. Check server API key configuration.",
      { code: "AI_PROVIDER_AUTH", httpStatus: status }
    );
  }
  if (
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("exceeded your current quota")
  ) {
    providerFailure(
      `AlgoPath AI provider quota/rate limit exceeded (${provider}). Retry later or check billing.`,
      { code: "AI_PROVIDER_QUOTA", httpStatus: status || 429 }
    );
  }
  if (
    status === 404 ||
    lower.includes("not found") ||
    lower.includes("no longer available")
  ) {
    const cfg = getAiProviderConfig();
    providerFailure(
      `AlgoPath AI model is unavailable (${cfg.model}). Check GEMINI_MODEL / OPENAI_MODEL configuration.`,
      { code: "AI_PROVIDER_MODEL", httpStatus: status || 404, model: cfg.model }
    );
  }
  if (status === 400) {
    providerFailure(
      "AlgoPath AI provider rejected the request.",
      { code: "AI_PROVIDER_BAD_REQUEST", httpStatus: status }
    );
  }
  providerFailure(
    "AlgoPath AI provider temporarily unavailable. Try again shortly.",
    { httpStatus: status }
  );
}

async function runGeminiAssist(
  key: string,
  model: string,
  userContent: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: LEARNING_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userContent }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      // Gemini 3.x may consume tokens for internal reasoning; keep headroom for visible text.
      maxOutputTokens: 2048,
    },
  });

  // Gemini free/shared capacity often returns 503/429; retry with backoff.
  const maxAttempts = 6;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: payload,
      });
    } catch {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, Math.min(8000, 600 * 2 ** (attempt - 1))));
        continue;
      }
      providerFailure("AlgoPath AI provider is unreachable. Try again shortly.");
    }

    lastStatus = res.status;
    // Transient Gemini capacity / rate-limit — exponential backoff
    if ((res.status === 503 || res.status === 429) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, Math.min(10000, 700 * 2 ** (attempt - 1))));
      continue;
    }

    if (!res.ok) {
      const snippet = await readProviderErrorSnippet(res);
      mapHttpProviderError(res.status, "gemini", snippet);
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      providerFailure("AlgoPath AI returned an unreadable response.");
    }

    const block = json?.promptFeedback?.blockReason;
    if (block) {
      providerFailure("AlgoPath AI could not generate a reply for this request.", {
        code: "AI_PROVIDER_BLOCKED",
      });
    }

    const parts = json?.candidates?.[0]?.content?.parts;
    const reply = Array.isArray(parts)
      ? parts
          .filter((p: any) => p?.text && !p.thought)
          .map((p: any) => String(p.text || ""))
          .join("")
          .trim()
      : "";
    if (reply) return reply;

    const fallback = Array.isArray(parts)
      ? parts
          .map((p: any) => String(p?.text || ""))
          .join("")
          .trim()
      : "";
    if (fallback) return fallback;

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      continue;
    }
    providerFailure("AlgoPath AI returned an empty response.");
  }

  mapHttpProviderError(lastStatus || 503, "gemini");
}

async function runOpenAiAssist(
  key: string,
  model: string,
  userContent: string
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: "system", content: LEARNING_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
  } catch {
    providerFailure("AlgoPath AI provider is unreachable. Try again shortly.");
  }

  if (!res.ok) {
    mapHttpProviderError(res.status, "openai");
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    providerFailure("AlgoPath AI returned an unreadable response.");
  }

  const reply = String(json?.choices?.[0]?.message?.content || "").trim();
  if (!reply) {
    providerFailure("AlgoPath AI returned an empty response.");
  }
  return reply;
}

export async function runAiAssist(args: {
  feature: AiFeatureId;
  problemTitle?: string;
  problemDescription?: string;
  userMessage?: string;
  errorMessage?: string;
  testCase?: string;
  codeSnippet?: string;
  language?: string;
}): Promise<{
  reply: string;
  provider: AiProviderName;
  learningMode: true;
  refusedDump: boolean;
}> {
  const userBlob = [
    args.userMessage,
    args.errorMessage,
    args.testCase,
    args.codeSnippet,
  ]
    .filter(Boolean)
    .join("\n");

  const refusedDump = looksLikeSolutionDumpRequest(userBlob);
  if (refusedDump) {
    const policy = refusalAssistResponse({
      feature: args.feature,
      problemTitle: args.problemTitle,
    });
    return {
      reply: policy.reply,
      provider: "policy",
      learningMode: true,
      refusedDump: true,
    };
  }

  const { provider, key, model } = requireProviderKey();
  const userContent = buildUserContent(args);

  const reply =
    provider === "gemini"
      ? await runGeminiAssist(key, model, userContent)
      : await runOpenAiAssist(key, model, userContent);

  return {
    reply,
    provider,
    learningMode: true,
    refusedDump: false,
  };
}
