/**
 * Minimal Groq (OpenAI-compatible) JSON chat client, shared by the AI features
 * (BB-185 flavor enrichment; BB-130 keeps its own inline copy for now). Same
 * provider/model/pacing rationale as documented in ai/index.ts.
 */
import { defineSecret } from "firebase-functions/params";

export const GROQ_API_KEY = defineSecret("GROQ_API_KEY");
export const GROQ_MODEL = "llama-3.1-8b-instant";

/** Thrown when the model returns 429 so callers can map it to a retry/back-off. */
export class RateLimitError extends Error {
  constructor() {
    super("model_rate_limited");
  }
}

/**
 * Call Groq's chat completions expecting a JSON-object reply (temp 0, JSON mode)
 * and return the parsed object. Throws RateLimitError on 429, Error otherwise.
 */
export async function chatJson(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError();
  }
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content) as Record<string, unknown>;
}
