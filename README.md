# pi-lmstudio

Extensions for the [Pi coding agent](https://github.com/mario-zechner/pi-coding-agent) that integrate your local LLMs running in **LM Studio** or **llama-server** directly into your AI-assisted coding workflow.

## Prerequisites

1. **Pi Coding Agent** installed.

### For LM Studio

- **LM Studio** installed and running.
- **LM Studio Local Server enabled**:
  - Open LM Studio.
  - Go to the **Local Server** tab.
  - Turn on the switch.

### For llama-server

- **llama-server** installed and running in **router mode**.
- Models loaded via the command line (e.g., `llama-server --models-preset ./my-models.ini`).
- It is best to explicitly specify `ctx-size` in `models.ini` so the context length is reported correctly.

## Installation

```bash
pi install npm:pi-lmstudio
```

## Configuration

### LM Studio

By default, the extension connects to LM Studio at `http://127.0.0.1:1234`.

To customize the URL, create or modify `~/.pi/agent/lmstudio.json`:

```json
{
  "url": "http://127.0.0.1:1234"
}
```

### llama-server

By default, the extension connects to llama-server at `http://127.0.0.1:8080`.

To customize the URL, create or modify `~/.pi/agent/llama-server.json`:

```json
{
  "url": "http://127.0.0.1:8080"
}
```

## Usage

1. **Launch Pi**: Extensions are automatically loaded on startup.
   ```bash
   pi
   ```

2. **Select a Model**:
   - Use the `/model` command.
   - Or use `Ctrl+P` (Command Palette) and search for your model.
   - Look for models prefixed with `lmstudio` or `llama-server`.

## Notes

### Context Length

- **LM Studio**: The actual usable context length is only reported after the model is fully loaded. The extension reloads the model info to retrieve the accurate value.
- **llama-server**: Context length is only available if you explicitly specify it in `models.ini` when launching the server.

## License

[MIT](LICENSE)
