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

By default, the extension connects to LM Studio default: `http://127.0.0.1:1234`

To customize the url, create or modify after first pi launch: `~/.pi/agent/lmstudio.json`

```json
{
  "url": "http://127.0.0.1:1234",
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
   - Look for models prefixed with `lmstudio`.

3. **Automatic Refresh**: The extension automatically refreshes its model list after every agent session (`agent_end`) to pick up any new models you've loaded in LM Studio.

## License

[MIT](LICENSE)
