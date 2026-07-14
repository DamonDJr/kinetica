import OpenAI from "openai";

export const ai = new OpenAI({
  baseURL: process.env.LLAMA_CPP_BASE_URL ?? "http://localhost:1234/v1",
  apiKey: "not-needed",
});

export const AI_MODEL = process.env.AI_MODEL ?? "qwen3.5-9b";

// Some models (e.g. LFM2) emit chain-of-thought as <think>...</think> inline in
// the message content rather than in a separate reasoning channel. Strip it so
// it never reaches JSON.parse or the user-facing text.
export function stripReasoning(text: string): string {
  let out = text;
  // Remove complete <think>...</think> blocks (multiline, non-greedy).
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // If only a closing tag remains (opening was prefilled/implied), keep the
  // content after the last close tag — that's the actual answer.
  const lastClose = out.lastIndexOf("</think>");
  if (lastClose !== -1) out = out.slice(lastClose + "</think>".length);
  // An unterminated <think> with no close means the whole response was reasoning
  // (likely truncated) — there is no usable answer.
  const openIdx = out.indexOf("<think>");
  if (openIdx !== -1) out = out.slice(0, openIdx);
  return out.trim();
}

export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  opts?: { temperature?: number; maxTokens?: number }
) {
  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: opts?.temperature ?? 0.7,
    // Reasoning models (e.g. LFM2) spend ~1k tokens thinking before they emit
    // any answer, so a low cap truncates mid-<think> and yields nothing usable.
    max_tokens: opts?.maxTokens ?? 4096,
  });
  return stripReasoning(response.choices[0]?.message?.content ?? "");
}

export async function generateVisionCompletion(
  systemPrompt: string,
  userText: string,
  images: { base64: string; mimeType: string }[],
  opts?: { temperature?: number; maxTokens?: number }
) {
  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
          { type: "text" as const, text: userText },
        ],
      },
    ],
    temperature: opts?.temperature ?? 0.6,
    max_tokens: opts?.maxTokens ?? 4096,
  });
  return stripReasoning(response.choices[0]?.message?.content ?? "");
}

function parseJsonResponse<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    // Models sometimes wrap the JSON in prose. Extract the outermost object or
    // array so leading/trailing text doesn't break the parse.
    const start = cleaned.search(/[{[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

export async function generateJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  opts?: { maxTokens?: number }
): Promise<T | null> {
  const system = systemPrompt + "\n\nRespond ONLY with valid JSON. No markdown, no explanation.";
  const raw = await generateCompletion(system, userPrompt, {
    temperature: 0.3,
    maxTokens: opts?.maxTokens ?? 6000,
  });
  const parsed = parseJsonResponse<T>(raw);
  if (parsed !== null) return parsed;

  // One corrective retry: local models occasionally emit malformed JSON on the
  // first pass but recover reliably when told exactly what went wrong.
  const retry = await generateCompletion(
    system,
    userPrompt +
      "\n\nYour previous response was not valid JSON. Respond again with ONLY the JSON object — no prose, no markdown fences, no trailing commas.",
    { temperature: 0.2, maxTokens: opts?.maxTokens ?? 6000 }
  );
  return parseJsonResponse<T>(retry);
}
