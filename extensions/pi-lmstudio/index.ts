import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "lmstudio.json");
const DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234";
const PROVIDER_PREFIX = "lmstudio";

interface ServerEntry {
  name: string;
  url: string;
}

interface Config {
  url?: string;
  urls?: ServerEntry[];
}

/** A single server to register: a provider name paired with its resolved base URL. */
interface Server {
  providerName: string;
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

/**
 * Resolve the list of servers to register from the config.
 *
 * - `urls` (non-empty) wins: one provider per entry, named `lmstudio/<name>`.
 *   If `url` is also present it is ignored (warn).
 * - `url` only: a single bare `lmstudio` provider.
 * - Empty `urls` or neither key: the default URL as a bare `lmstudio` provider.
 *
 * Validation never throws — bad entries are skipped with a warning.
 */
function resolveServers(): Server[] {
  const config = getConfig();

  if (Array.isArray(config.urls) && config.urls.length > 0) {
    if (config.url) {
      console.error("LM Studio config has both 'url' and 'urls'; ignoring 'url'.");
    }
    const servers: Server[] = [];
    const seen = new Set<string>();
    for (const entry of config.urls) {
      if (!entry || !entry.name || !entry.url) {
        console.error("LM Studio config 'urls' entry missing 'name' or 'url'; skipping:", entry);
        continue;
      }
      const providerName = `${PROVIDER_PREFIX}/${entry.name}`;
      if (seen.has(providerName)) {
        console.error(`LM Studio config has duplicate server name '${entry.name}'; last one wins.`);
      }
      seen.add(providerName);
      // Re-registering the same provider name overwrites, so keep the last entry.
      const existing = servers.findIndex(s => s.providerName === providerName);
      const server = { providerName, url: resolveValue(entry.url) };
      if (existing !== -1) servers[existing] = server;
      else servers.push(server);
    }
    return servers;
  }

  const url = resolveValue(config.url || DEFAULT_LM_STUDIO_URL);
  return [{ providerName: PROVIDER_PREFIX, url }];
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
function mapModels(models: LMStudioModel[], providerName: string): ProviderModelConfig[] {
  return models.map(m => ({
    id: m.key,
    name: m.display_name,
    reasoning: m.capabilities?.reasoning !== undefined,
    provider: providerName,
    input: m.capabilities?.vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.loaded_instances[0]?.config.context_length ?? m.max_context_length,
    maxTokens: m.max_context_length,
  }));
}

/**
 * Fetch models from an LM Studio endpoint
 */
async function fetchModels(url: string, providerName: string): Promise<ProviderModelConfig[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${url}/api/v1/models`, { signal: controller.signal });
    if (!response.ok) throw new Error(`LM Studio HTTP status: ${response.status}`);

    const data: LMStudioResponse = await response.json();
    return mapModels((data.models || []).filter(m => m.type === "llm"), providerName);
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error("LM Studio request timed out");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function (pi: ExtensionAPI) {
  // Provider names registered in the previous cycle, so drops can be reconciled.
  let registered = new Set<string>();

  /**
   * Fetch every configured server in parallel and reconcile providers:
   * reachable servers register (skip-until-reachable), and any server that
   * was registered before but is now unreachable or gone from config is
   * unregistered.
   */
  async function syncProviders() {
    const servers = resolveServers();
    const results = await Promise.allSettled(
      servers.map(async (s) => ({
        server: s,
        models: await fetchModels(s.url, s.providerName),
      }))
    );

    const nowRegistered = new Set<string>();
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { server, models } = result.value;
      pi.registerProvider(server.providerName, {
        baseUrl: `${server.url}/v1/`,
        api: "openai-completions",
        apiKey: "lmstudio",
        models,
      });
      nowRegistered.add(server.providerName);
    }

    // Unregister providers that were up last cycle but dropped or disappeared.
    for (const name of registered) {
      if (!nowRegistered.has(name)) {
        pi.unregisterProvider(name);
      }
    }
    registered = nowRegistered;
  }

  await syncProviders();

  let fetchedThisCycle = false;

  pi.on("agent_start", async () => {
    fetchedThisCycle = false;
  });

  pi.on("message_end", async (event, _ctx) => {
    if (event.message.role === "assistant" && !fetchedThisCycle) {
      fetchedThisCycle = true;
      await syncProviders();
    }
  });
}
