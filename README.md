# pi-lmstudio

An extension for the [Pi coding agent](https://github.com/mario-zechner/pi-coding-agent) that integrates your local LLMs running in **LM Studio** directly into your AI-assisted coding workflow.

## Prerequisites

1. **Pi Coding Agent** installed.
2. **LM Studio** installed and running.
3. **LM Studio Local Server enabled**:
   - Open LM Studio.
   - Go to the **Local Server** tab.
   - Turn on the switch.

## Installation

```bash
pi install npm:pi-lmstudio
```

## Configuration

By default, the extension connects to LM Studio at `http://127.0.0.1:1234`.

To customize the URL, create or modify `~/.pi/agent/lmstudio.json`:

```json
{ "url": "http://127.0.0.1:1234" }
```

You can also use environment variables (prefix with `$`):

```json
{ "url": "$LM_STUDIO_URL" }
```

### Timeouts

Two timeout values control how long the extension waits for the LM Studio server:

- **`livenessProbeTimeout`** — Socket-level reachability check (default: `500`ms). Before making an HTTP request, the extension quickly checks whether the server accepts TCP connections. If the server is unreachable, the probe fails fast and the request is skipped entirely.

- **`timeout`** — HTTP request timeout for the model list fetch (default: `5000`ms). Only applies once the liveness probe has confirmed the server is reachable.

```json
{
  "url": "http://192.168.1.64:1234",
  "livenessProbeTimeout": 500, // You may need to increase this when LM Studio is outside the local network
  "timeout": 5000
}
```

#### Multiple servers

To connect to several LM Studio instances at once (e.g. a desktop plus a remote GPU box), use the `urls` list instead. Each entry needs a `name`, and its models appear in the picker under `lmstudio/<name>`:

```json
{
  "urls": [
    { "name": "desktop", "url": "http://127.0.0.1:1234" },
    { "name": "gpu-box", "url": "$GPU_BOX_URL" }
  ]
}
```

Notes:

- Unreachable servers are skipped and picked up automatically once they come online (refreshed each turn).
- If both `url` and `urls` are set, `urls` takes precedence and `url` is ignored.

#### Authentication

LM Studio can be configured to require a Bearer token for API access. When using the `urls` list form, add a `token` field to any entry that needs it. The `token` field accepts either a literal string or an environment variable reference (prefixed with `$`):

```json
{
  "urls": [
    { "name": "desktop", "url": "http://127.0.0.1:1234" },
    { "name": "gpu-box", "url": "http://10.0.0.5:1234", "token": "my-secret-token" },
    { "name": "remote", "url": "http://10.0.0.6:1234", "token": "$LM_STUDIO_TOKEN" }
  ]
}
```

The token is sent as an `Authorization: Bearer` header for both model discovery and chat requests.

## Usage

1. **Launch Pi**: Extensions are automatically loaded on startup.
   ```bash
   pi
   ```

2. **Select a Model**:
   - Use the `/model` command.
   - Or use `Ctrl+P` (Command Palette) and search for your model.
   - Look for models prefixed with `lmstudio`.

## Notes

### Context Length

- The actual usable context length is only reported after the model is fully loaded. The extension reloads the model info to retrieve the accurate value.

## License

[MIT](LICENSE)
