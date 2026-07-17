import assert from "node:assert/strict";
import test from "node:test";

import extension, { mapModels } from "../extensions/pi-lmstudio/index.ts";

function model(overrides = {}) {
  return {
    type: "llm",
    publisher: "local",
    key: "test-model",
    display_name: "Test Model",
    size_bytes: 1,
    params_string: null,
    loaded_instances: [],
    max_context_length: 262144,
    format: "gguf",
    variants: [],
    selected_variant: "",
    ...overrides,
  };
}

test("uses the theoretical context window while a model is unloaded", () => {
  const [mapped] = mapModels([model()], "lmstudio");

  assert.equal(mapped.contextWindow, 262144);
  assert.equal(mapped.maxTokens, 262144);
});

test("caps output tokens to the loaded context window", () => {
  const loadedModel = model({
    loaded_instances: [
      {
        id: "test-model",
        config: {
          context_length: 40192,
          eval_batch_size: 512,
          flash_attention: true,
          num_experts: 0,
          offload_kv_cache_to_gpu: true,
        },
      },
    ],
  });
  const [mapped] = mapModels([loadedModel], "lmstudio");

  assert.equal(mapped.contextWindow, 40192);
  assert.equal(mapped.maxTokens, 40192);
});

test("refreshes model limits for idle input before preflight", async () => {
  const originalFetch = globalThis.fetch;
  const unloadedModel = model();
  const loadedModel = model({
    loaded_instances: [
      {
        id: "test-model",
        config: {
          context_length: 40192,
          eval_batch_size: 512,
          flash_attention: true,
          num_experts: 0,
          offload_kv_cache_to_gpu: true,
        },
      },
    ],
  });
  const responses = [unloadedModel, loadedModel];
  const handlers = new Map();
  const registeredContextWindows = [];

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ models: [responses.shift()] }),
  });

  const pi = {
    on: (event, handler) => handlers.set(event, handler),
    registerProvider: (provider, config) => {
      registeredContextWindows.push(config.models[0].contextWindow);
    },
    unregisterProvider: () => {},
  };

  try {
    await extension(pi);
    await handlers.get("input")({ streamingBehavior: undefined });
    await handlers.get("input")({ streamingBehavior: "steer" });
    await handlers.get("input")({ streamingBehavior: "followUp" });

    assert.deepEqual(registeredContextWindows, [262144, 40192]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refreshes model limits after the first assistant message", async () => {
  const originalFetch = globalThis.fetch;
  const unloadedModel = model();
  const loadedModel = model({
    loaded_instances: [
      {
        id: "test-model",
        config: {
          context_length: 40192,
          eval_batch_size: 512,
          flash_attention: true,
          num_experts: 0,
          offload_kv_cache_to_gpu: true,
        },
      },
    ],
  });
  const responses = [unloadedModel, loadedModel];
  const handlers = new Map();
  const registeredContextWindows = [];

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ models: [responses.shift()] }),
  });

  const pi = {
    on: (event, handler) => handlers.set(event, handler),
    registerProvider: (_provider, config) => {
      registeredContextWindows.push(config.models[0].contextWindow);
    },
    unregisterProvider: () => {},
  };

  try {
    await extension(pi);
    await handlers.get("agent_start")();
    await handlers.get("message_end")({ message: { role: "user" } });
    await handlers.get("message_end")({ message: { role: "assistant" } });
    await handlers.get("message_end")({ message: { role: "assistant" } });

    assert.deepEqual(registeredContextWindows, [262144, 40192]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
