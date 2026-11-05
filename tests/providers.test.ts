import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let homes: string[] = [];
afterEach(() => {
  mock.restoreAll();
  for (const home of homes) fs.rmSync(home, { recursive: true, force: true });
  homes = [];
});

async function start(config: unknown) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lmstudio-test-"));
  homes.push(home);
  fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
  fs.writeFileSync(path.join(home, ".pi", "agent", "lmstudio.json"), JSON.stringify(config));
  mock.method(os, "homedir", () => home);
  const requests: string[] = [];
  mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    return new Response(JSON.stringify({ models: [
      { type: "llm", key: "org/model", display_name: "Model", loaded_instances: [], max_context_length: 8192 },
      { type: "embedding", key: "embedding", loaded_instances: [], max_context_length: 512 },
    ] }));
  });
  const providers = new Map<string, any>();
  const { default: extension } = await import(`../extensions/pi-lmstudio/index.ts?home=${encodeURIComponent(home)}`);
  await extension({
    registerProvider: (name: string, config: unknown) => providers.set(name, config),
    unregisterProvider: (name: string) => providers.delete(name),
    on: () => {},
  } as any);
  return { providers, requests };
}

test("custom providers survive first-slash client selection without changing model IDs", async () => {
  const { providers, requests } = await start({ urls: [
    { name: "desktop", provider: "lmstudio-desktop", url: "http://desktop:1234" },
    { name: "remote", provider: "lmstudio-remote", url: "http://remote:1234" },
  ] });
  assert.deepEqual([...providers.keys()], ["lmstudio-desktop", "lmstudio-remote"]);
  assert.deepEqual(requests, ["http://desktop:1234/api/v1/models", "http://remote:1234/api/v1/models"]);
  for (const [provider, config] of providers) {
    assert.equal(config.models.length, 1);
    assert.equal(config.models[0].id, "org/model");
    const slug = `${provider}/${config.models[0].id}`;
    const separator = slug.indexOf("/");
    assert.equal(slug.slice(0, separator), provider);
    assert.equal(slug.slice(separator + 1), "org/model");
  }
  assert.equal(providers.get("lmstudio-remote").baseUrl, "http://remote:1234/v1/");
});

test("existing multi-server names remain unchanged", async () => {
  const { providers } = await start({ urls: [{ name: "desktop", url: "http://desktop:1234" }] });
  assert.deepEqual([...providers.keys()], ["lmstudio/desktop"]);
});

test("legacy single-server config keeps the bare provider", async () => {
  const { providers } = await start({ url: "http://desktop:1234" });
  assert.deepEqual([...providers.keys()], ["lmstudio"]);
});

test("invalid provider overrides are skipped", async () => {
  mock.method(console, "error", () => {});
  const { providers, requests } = await start({ urls: [
    { name: "empty", provider: " ", url: "http://empty:1234" },
    { name: "number", provider: 42, url: "http://number:1234" },
  ] });
  assert.equal(providers.size, 0);
  assert.deepEqual(requests, []);
});
