import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "lmstudio.json");
const DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234";

interface Config {
  url: string;
}

function resolveValue(value: string): string {
  if (value.startsWith('$')) {
    const envKey = value.slice(1);
    return process.env[envKey] ?? value;
  }
  return value;
}

function getConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch (error) {
    console.error(`Failed to read LM Studio config at ${CONFIG_PATH}:`, error);
  }
  return { url: DEFAULT_LM_STUDIO_URL };
}

function getLmStudioUrl(): string {
  return resolveValue(getConfig().url || DEFAULT_LM_STUDIO_URL);
}

interface LMStudioLoadedInstance {
  id: string;
  config: {
    context_length: number;
    eval_batch_size: number;
    flash_attention: boolean;
    num_experts: number;
    offload_kv_cache_to_gpu: boolean;
  }
}

interface LMStudioModel {
  type: string;
  publisher: string;
  key: string;
  display_name: string;
  architecture?: string;
  quantization?: { name: string; bits_per_weight: number };
  size_bytes: number;
  params_string: string | null;
  loaded_instances: LMStudioLoadedInstance[];
  max_context_length: number;
  format: string;
  capabilities?: {
    vision?: boolean;
    trained_for_tool_use?: boolean;
    reasoning?: { allowed_options: string[]; default: string };
  };
  description?: string | null;
  variants: string[];
  selected_variant: string;
}

interface LMStudioResponse {
  models: LMStudioModel[];
}

/**
 * Helper to map LMStudioModel to Pi's model format
 */
function mapModels(models: LMStudioModel[]): ProviderModelConfig[] {
  return models.map(m => ({
    id: m.key,
    name: m.display_name,
    reasoning: m.capabilities?.reasoning !== undefined,
    provider: "lmstudio",
    input: m.capabilities?.vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.loaded_instances[0]?.config.context_length ?? m.max_context_length,
    maxTokens: m.max_context_length,
  }));
}

/**
 * Fetch models from LM Studio endpoint
 */
async function fetchModels(): Promise<ProviderModelConfig[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${getLmStudioUrl()}/api/v1/models`, { signal: controller.signal });
    if (!response.ok) throw new Error(`LM Studio HTTP status: ${response.status}`);

    const data: LMStudioResponse = await response.json();
    return mapModels((data.models || []).filter(m => m.type === "llm"));
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error("LM Studio request timed out");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function (pi: ExtensionAPI) {
  pi.registerProvider("lmstudio", {
    baseUrl: `${getLmStudioUrl()}/v1/`,
    api: "openai-completions",
    apiKey: "lmstudio",
    models: await fetchModels().catch(() => [])
  });

  let fetchedThisCycle = false;

  pi.on("agent_start", async () => {
    fetchedThisCycle = false;
  });

  pi.on("message_end", async (event, _ctx) => {
    if (event.message.role === "assistant" && !fetchedThisCycle) {
      fetchedThisCycle = true;
      pi.registerProvider("lmstudio", {
        baseUrl: `${getLmStudioUrl()}/v1/`,
        api: "openai-completions",
        apiKey: "lmstudio",
        models: await fetchModels().catch(() => [])
      });
    }
  });
}
