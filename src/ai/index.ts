/**
 * AI facade: one entry point for the dashboard, dispatching between the
 * local heuristic provider (offline, not AI) and the OpenAI-compatible
 * remote provider (user's endpoint + key, explicit consent required).
 */
import type { ThemeTokens } from "../types/theme";
import { loadSettings } from "../settings/store";
import {
  generateThemeFromPrompt,
  harmonizeFromBase,
  analyzeContrast,
  suggestImprovements,
  type ContrastIssue,
} from "./local";
import {
  generateTokensRemote,
  testConnection,
  loadApiKey,
  saveApiKey,
  chatCompletion,
  extractJsonObject,
  type ConnectionResult,
} from "./remote";

export type { ContrastIssue, ConnectionResult };
export { loadApiKey, saveApiKey, extractJsonObject };

export type AiTask =
  | "generate"
  | "harmonize"
  | "analyze"
  | "improve"
  | "testConnection";

export interface AiRequest {
  prompt?: string;
  baseColor?: string;
  tokens?: ThemeTokens;
}

export type AiResult =
  | { task: "generate"; tokens: ThemeTokens; provider: "local" | "openai" }
  | { task: "harmonize"; colors: { accent: string; secondary: string; tertiary: string } }
  | { task: "analyze"; issues: ContrastIssue[] }
  | { task: "improve"; tokens: ThemeTokens; fixedCount: number }
  | { task: "testConnection"; result: ConnectionResult };

/** Which provider is actually configured right now. */
export async function activeProvider(): Promise<"local" | "openai"> {
  const settings = await loadSettings();
  if (
    settings.ai.enabled &&
    settings.ai.provider === "openai" &&
    settings.ai.allowRemote
  ) {
    return "openai";
  }
  return "local";
}

/**
 * Run an AI task. Remote calls happen only for "generate" when the user
 * explicitly opted in; everything else stays local by design (palette
 * analysis never leaves the browser).
 */
export async function runAiTask(task: AiTask, input: AiRequest): Promise<AiResult> {
  switch (task) {
    case "generate": {
      const prompt = input.prompt ?? "";
      const localTokens = generateThemeFromPrompt(prompt);
      const provider = await activeProvider();
      if (provider === "openai") {
        try {
          const tokens = await generateTokensRemote(prompt, input.tokens ?? localTokens);
          return { task: "generate", tokens, provider: "openai" };
        } catch {
          // Remote failed → fall back to the local heuristic; the panel
          // reports which provider actually produced the result.
          return { task: "generate", tokens: localTokens, provider: "local" };
        }
      }
      return { task: "generate", tokens: localTokens, provider: "local" };
    }

    case "harmonize": {
      const colors = harmonizeFromBase(input.baseColor ?? "#d9204f");
      if (!colors) throw new Error("Некорректный цвет");
      return { task: "harmonize", colors };
    }

    case "analyze": {
      const tokens = input.tokens;
      if (!tokens) throw new Error("Нет данных темы");
      return { task: "analyze", issues: analyzeContrast(tokens) };
    }

    case "improve": {
      const tokens = input.tokens;
      if (!tokens) throw new Error("Нет данных темы");
      const improved = suggestImprovements(tokens);
      const fixedCount = analyzeContrast(tokens).length - analyzeContrast(improved).length;
      return { task: "improve", tokens: improved, fixedCount: Math.max(0, fixedCount) };
    }

    case "testConnection": {
      return { task: "testConnection", result: await testConnection() };
    }

    default: {
      const never: never = task;
      throw new Error(`Unknown task: ${String(never)}`);
    }
  }
}

// Re-exported for tests and for panels that build prompts directly.
export { chatCompletion };
export {
  generateThemeFromPrompt,
  harmonizeFromBase,
  analyzeContrast,
  suggestImprovements,
} from "./local";
