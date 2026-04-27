import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "llama-server.json");
const DEFAULT_LLAMA_SERVER_URL = "http://127.0.0.1:8080";

interface Config {
  url: string;
}

function getConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (error) {
    console.error(`Failed to read llama-server config at ${CONFIG_PATH}:`, error);
  }
  return { url: DEFAULT_LLAMA_SERVER_URL };
}

function getLlamaServerUrl(): string {
  return getConfig().url || DEFAULT_LLAMA_SERVER_URL;
}

const LLAMA_SERVER_URL = getLlamaServerUrl();

interface LlamaServerModelStatus {
  value: string;
  args: string[];
  preset: string;
}

interface LlamaServerModel {
  id: string;
  aliases: string[];
  tags: string[];
  object: string;
  owned_by: string;
  created: number;
  status: LlamaServerModelStatus;
}

interface LlamaServerResponse {
  data: LlamaServerModel[];
  object: string;
}

/**
 * Extract context length (--ctx-size) from the args array.
 * Args are key-value pairs like ["--ctx-size", "128000"].
 */
function extractContextLength(args: string[]): number | undefined {
  const idx = args.indexOf("--ctx-size");
  if (idx !== -1 && idx + 1 < args.length) {
    const parsed = Number(args[idx + 1]);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * Helper to map LlamaServerModel to Pi's model format
 */
function mapModels(models: LlamaServerModel[]): ProviderModelConfig[] {
  return models
    .filter(m => m.id !== "default")
    .map(m => {
      const ctxSize = extractContextLength(m.status.args);
      return {
        id: m.id,
        name: m.id,
        reasoning: false,
        provider: "llama-server",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: ctxSize ?? 0,
        maxTokens: ctxSize ?? 0,
      };
    });
}

/**
 * Fetch models from llama-server endpoint
 */
async function fetchModels(): Promise<ProviderModelConfig[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/models`, { signal: controller.signal });
    if (!response.ok) throw new Error(`llama-server HTTP status: ${response.status}`);

    const data: LlamaServerResponse = await response.json();
    return mapModels((data.data || []).filter(m => m.object === "model"));
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error("llama-server request timed out");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("llama-server", {
    baseUrl: `${LLAMA_SERVER_URL}/v1/`,
    api: "openai-completions",
    apiKey: "llamaserver",
    models: await fetchModels().catch(() => [])
  });
}
