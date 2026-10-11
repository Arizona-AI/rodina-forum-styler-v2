/**
 * OpenAI-compatible chat client (production-ready skeleton).
 *
 * Data policy (enforced here, documented in SECURITY.md):
 *  - only the user's own theme palette + prompt are sent — never forum
 *    content, cookies, account data or extension settings,
 *  - the API key lives in a separate storage key (rfs.aiSecrets), is never
 *    logged, never included in exports/debug reports,
 *  - remote calls require BOTH provider="openai" AND explicit allowRemote
 *    consent in settings; otherwise we throw a readable Russian error,
 *  - requests are bounded by a hard timeout and validated before use.
 */
import type { ThemeTokens } from "../types/theme";
import { sanitizeTokens, DEFAULT_THEME_TOKENS } from "../theme/validate";
import { AI_SECRETS_KEY, loadSettings } from "../settings/store";
import { storageGet, storageSet } from "../shared/browser";
import { MAX_THEME_JSON_LENGTH, sanitizeLabel } from "../shared/validators";
import { logger } from "../shared/logger";

const SCOPE = "ai.remote";
const TIMEOUT_MS = 20_000;

export interface AiSecrets {
  apiKey: string;
}

export async function loadApiKey(): Promise<string> {
  const secrets = await storageGet<AiSecrets>(AI_SECRETS_KEY);
  return typeof secrets?.apiKey === "string" ? secrets.apiKey : "";
}

export async function saveApiKey(key: string): Promise<void> {
  await storageSet(AI_SECRETS_KEY, { apiKey: key.trim() } satisfies AiSecrets);
}

/** Guard: remote calls are opt-in and provider-specific. */
async function assertRemoteAllowed(): Promise<{ endpoint: string; apiKey: string; model: string }> {
  const settings = await loadSettings();
  if (settings.ai.provider !== "openai") {
    throw new Error("Провайдер не настроен на OpenAI-совместимый API");
  }
  if (!settings.ai.allowRemote) {
    throw new Error("Разрешите отправку палитры в настройках AI (явное согласие)");
  }
  const endpoint = settings.ai.endpoint.trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(endpoint)) {
    throw new Error("Нужен HTTPS-адрес endpoint");
  }
  const apiKey = await loadApiKey();
  if (!apiKey) {
    throw new Error("API-ключ не сохранён");
  }
  return { endpoint, apiKey, model: settings.ai.model.trim() || "gpt-4o-mini" };
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatChoice {
  message?: { content?: unknown };
}

interface ChatResponse {
  choices?: ChatChoice[];
}

/**
 * Low-level completion call. Payload contains only the messages we build
 * (prompt + palette) — asserted by construction and by the test suite.
 */
export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const { endpoint, apiKey, model } = await assertRemoteAllowed();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.7, response_format: { type: "json_object" } }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("Пустой ответ модели");
    }
    return content;
  } catch (err) {
    logger.error(SCOPE, `completion failed: ${String(err)}`);
    throw new Error(`Не удалось подключиться: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract a JSON object from model output: tolerates code fences and
 * leading/trailing prose (common across OpenAI-compatible servers).
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  text = text.slice(start, end + 1);
  if (text.length > MAX_THEME_JSON_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

const SYSTEM_PROMPT =
  "Ты — генератор дизайн-палитр для форума XenForo. Отвечай ТОЛЬКО JSON-объектом " +
  "со всеми полями ThemeTokens (цвета в #rrggbb, радиусы в px). Не добавляй код и пояснения.";

/** Ask the remote model for tokens; sanitize before returning (never trust). */
export async function generateTokensRemote(
  prompt: string,
  current: ThemeTokens,
): Promise<ThemeTokens> {
  const safePrompt = sanitizeLabel(prompt, 500);
  if (!safePrompt) throw new Error("Описание пустое");
  const content = await chatCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        request: safePrompt,
        currentPalette: current,
        note: "Сделай палитру в стиле запроса, сохранив читаемость (AA).",
      }),
    },
  ]);
  const json = extractJsonObject(content);
  if (!json) throw new Error("Модель вернула не JSON");
  const tokens = sanitizeTokens(json["tokens"] ?? json, DEFAULT_THEME_TOKENS);
  if (!tokens) throw new Error("Палитра не прошла валидацию");
  return tokens;
}

export interface ConnectionResult {
  ok: boolean;
  error?: string;
}

/** Lightweight connectivity probe (one short completion). */
export async function testConnection(): Promise<ConnectionResult> {
  try {
    const reply = await chatCompletion([
      { role: "system", content: "Отвечай одним словом." },
      { role: "user", content: "ping" },
    ]);
    return { ok: reply.length > 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
