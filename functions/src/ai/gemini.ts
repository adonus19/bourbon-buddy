/**
 * Minimal Gemini API JSON client (BB-226), replacing the Groq client ahead of
 * the 2026-08-16 Llama shutdown. Two models, deliberately in separate
 * rate-limit buckets (limits are per model per project) so extraction and
 * enrichment never share a budget — same isolation we had on Groq:
 *
 *  - EXTRACTION_MODEL (gemini-3.1-flash-lite): true schema-constrained
 *    decoding, needed where output feeds JSON.parse + judgment matters.
 *    Free tier (verified 2026-07-17): 15 RPM / 250K TPM / 500 RPD — RPD is
 *    the binding limit.
 *  - FLAVOR_MODEL (gemma-4-31b-it): cheap and plentiful (Gemma free tier
 *    ~30 RPM / ~16K TPM / ~14K RPD for 26b — verify 31b's own numbers in AI
 *    Studio; our 12s sweep pacing is far under either). Gemma's "structured
 *    output" is prompt steering, not constrained decoding: it reliably
 *    appends a ``` fence (tested 3/3), so every reply passes through
 *    stripJsonFences — and a schema must ALWAYS be sent or it answers in
 *    markdown prose. NOT the 26b-a4b variant: its 4B active params degenerate
 *    into repetition loops with corrupted tokens on the flavor task
 *    (observed live 2026-07-17); 31b was clean 3/3 with differentiated
 *    profiles.
 *
 * Models are PINNED, not "-latest" aliases: an alias repoint silently changes
 * behavior under tuned prompts. The key is a Secret Manager secret
 * (GEMINI_API_KEY), never in code.
 */
import { defineSecret } from "firebase-functions/params";

export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const EXTRACTION_MODEL = "gemini-3.1-flash-lite";
export const FLAVOR_MODEL = "gemma-4-31b-it";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Thrown when the model returns 429 so callers can map it to a retry/back-off. */
export class RateLimitError extends Error {
  constructor() {
    super("model_rate_limited");
  }
}

/**
 * Remove a leading/trailing markdown code fence from a model reply. Gemma 4
 * emits valid JSON wrapped in a trailing ``` even under responseMimeType
 * "application/json"; Gemini models don't, but stripping is harmless there.
 */
export function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export interface GeminiRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  /** Defaults to 0 (deterministic extraction/classification). */
  temperature?: number;
  /** Gemini responseSchema for constrained decoding (Gemini models only —
   * Gemma treats it as steering). Optional; the prompt still specifies shape. */
  responseSchema?: Record<string, unknown>;
}

/**
 * Call generateContent expecting a JSON-text reply and return the (fence-
 * stripped) text. Throws RateLimitError on 429, Error otherwise. Returns ""
 * when the reply carries no candidates (e.g. safety-blocked) — callers decide
 * whether that's an empty result or a retry.
 */
export async function generateText(
  apiKey: string,
  req: GeminiRequest
): Promise<string> {
  const res = await fetch(`${BASE_URL}/${req.model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0,
        maxOutputTokens: req.maxTokens,
        responseMimeType: "application/json",
        ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
      },
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError();
  }
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  return stripJsonFences(text);
}

/**
 * JSON-object convenience over generateText — the shape the flavor features
 * consume (same contract the Groq chatJson had, plus an explicit model).
 *
 * Always pass a responseSchema for Gemma: without one it ignores
 * responseMimeType entirely and answers in markdown prose (observed live,
 * BB-226); with one it reliably emits JSON (modulo the stripped fence).
 */
export async function chatJson(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature = 0,
  responseSchema?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const text = await generateText(apiKey, {
    model,
    system,
    user,
    maxTokens,
    temperature,
    responseSchema,
  });
  return JSON.parse(text || "{}") as Record<string, unknown>;
}
