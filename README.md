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
