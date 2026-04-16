import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "lmstudio.json");
const DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234";

interface Config {
  url: string;
  models?: ProviderModelConfig[];
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

function saveConfig(config: Config): void {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const currentConfigStr = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf-8") : "";
    const newConfigStr = JSON.stringify(config, null, 2);

    if (currentConfigStr !== newConfigStr) {
      fs.writeFileSync(CONFIG_PATH, newConfigStr);
    }
  } catch (error) {
    console.error(`Failed to save LM Studio config at ${CONFIG_PATH}:`, error);
  }
}

function getLmStudioUrl(): string {
  return getConfig().url || DEFAULT_LM_STUDIO_URL;
}

const LM_STUDIO_URL = getLmStudioUrl();

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
 * Fetch models from LM Studio endpoint and cache them in Pi's format
 */
async function fetchAndCacheModels(): Promise<ProviderModelConfig[]> {
  const config = getConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${LM_STUDIO_URL}/api/v1/models`, { signal: controller.signal });
    if (!response.ok) throw new Error(`LM Studio HTTP status: ${response.status}`);

    const data: LMStudioResponse = await response.json();
    const models = mapModels((data.models || []).filter(m => m.type === "llm"));

    const currentModelIds = new Set(config.models?.map(m => m.id) || []);
    const newModelIds = new Set(models.map(m => m.id));

    const isChanged = currentModelIds.size !== newModelIds.size ||
      [...currentModelIds].some(id => !newModelIds.has(id));

    if (isChanged) {
      config.models = models;
      saveConfig(config);
    }

    return models;
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error("LM Studio request timed out");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

let models: ProviderModelConfig[] = [];

async function registerModels(pi: ExtensionAPI): Promise<void> {
  pi.registerProvider("lmstudio", {
    baseUrl: `${LM_STUDIO_URL}/v1/`,
    api: "openai-completions",
    apiKey: "lmstudio",
    models: await fetchAndCacheModels()
  });
}

export default function (pi: ExtensionAPI) {
  const config = getConfig();

  if (config.models && config.models.length > 0) {
    pi.registerProvider("lmstudio", {
      baseUrl: `${LM_STUDIO_URL}/v1/`,
      api: "openai-completions",
      apiKey: "lmstudio",
      models: config.models
    });
  } else {
    registerModels(pi).catch(() => { });
  }

  pi.on("agent_end", async () => {
    registerModels(pi).catch(() => { });
  });
}
