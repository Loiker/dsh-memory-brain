# dsh-memory-brain

Wire [memory-brain](https://github.com/peterpoal134/memory-brain) long-term memory into the DSH backend.

> **⚠️ Disclaimer**
>
> This plugin was built by AI (Muse, aka 萌萌のLoike娘～) for personal use. It works for us, but it comes with no warranty and no support.
>
> If you use it and something breaks, please troubleshoot it yourself. We cannot provide technical support or fix issues for other users.
>
> 本插件由 AI 构建，仅供个人使用，不提供任何保证与技术支持。使用出问题请自行排查，作者无力解决他人反馈。

## What it is

This is a **frontend bridge plugin** for DSH (DeepSeek Harness). It does not implement memory itself — it connects DSH to an external memory backend.

- **Frontend**: DSH plugin (this repo) — hooks into DSH's prompt lifecycle.
- **Backend**: [memory-brain](https://github.com/peterpoal134/memory-brain) by peterpoal134 — a Python + SQLite service that stores and retrieves memories via HTTP API.

You need both parts running for this to work.

## What it does

- **Before each reply**: recalls relevant memories from memory-brain and injects them into the prompt (five-way hybrid retrieval — vector + keyword + entity graph + importance + freshness; only relevant ones are injected, keeping context small and token-cheap).
- **After each reply**: automatically saves the conversation turn to memory-brain.

Without it, DSH has no long-term memory: in-session context only, restart = amnesia, no identity continuity.

## Architecture

```
User message
    │
    ▼
DSH (this plugin)
    │  POST /recall
    ▼
memory-brain service (127.0.0.1:8780)
    │  returns relevant memories
    ▼
DSH injects memories into system prompt
    │  LLM generates reply
    ▼
DSH (this plugin)
    │  POST /remember
    ▼
memory-brain service saves the turn
```

## Prerequisites

1. **DSH** installed and running (profile `web` or any profile).
2. **memory-brain** service running and reachable from the DSH host.
   - Install from https://github.com/peterpoal134/memory-brain
   - Default URL: `http://127.0.0.1:8780`
   - Get the API token from your memory-brain `.memory-env` file.

## Installation

```bash
dsh plugin --profile web add git+https://github.com/Loiker/dsh-memory-brain.git
```

Or install from npm (if published):

```bash
dsh plugin --profile web add dsh-memory-brain
```

Then restart DSH:

```bash
systemctl restart dsh-aurabot
```

## Configuration

Set these environment variables in your DSH environment, or edit `dist/dsh/plugin.js` directly:

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_BRAIN_URL` | `http://127.0.0.1:8780` | memory-brain API base URL |
| `MEMORY_BRAIN_TOKEN` | _(none)_ | memory-brain API token (required) |

The token is stored in your memory-brain `.memory-env` file. The plugin reads it from the environment at startup.

## How it works

The plugin hooks into DSH's prompt lifecycle via two functions:

### `recall`

Called before the LLM generates a reply.

1. Takes the user's latest message.
2. POSTs to memory-brain `/recall` with the message text.
3. Receives a block of relevant memories (ranked by the five-way hybrid retrieval).
4. Injects the memory block into the system prompt.

Only memories relevant to the current message are injected — this keeps the context window small and saves tokens.

### `remember`

Called after the LLM generates a reply.

1. Takes the full conversation turn (user message + assistant reply).
2. POSTs to memory-brain `/remember` with the turn text.
3. memory-brain stores it with metadata (importance, timestamp, type).

Over time, this builds a persistent memory of the user, the assistant's identity, and their shared history.

## Backend: memory-brain

This plugin is useless without the memory-brain backend. It is a separate project:

- **Repo**: https://github.com/peterpoal134/memory-brain
- **Author**: peterpoal134
- **License**: AGPL-3.0-or-later
- **Stack**: Python + SQLite + HTTP API
- **Features**: Five memory types (event/fact/reflection/skill/principle), PAD 3D emotion layer, identity layer, five-way hybrid retrieval, forgetting governance (decay, archive, similarity merge, conflict detection).

Please read the memory-brain README for setup instructions. This plugin only provides the DSH-side bridge; the backend is entirely peterpoal134's work.

## Verification

To check if the plugin is working:

1. Check the memory-brain service logs for `/recall` and `/remember` calls:
   ```bash
   journalctl -u memory-brain -n 20
   ```
   You should see `POST /recall` and `POST /remember` with status 200.

2. Ask DSH something it could only know from memory (e.g., a fact from a previous session). If it answers correctly, the recall path works.

3. Check the DSH Web UI plugin list — `dsh-memory-brain` should appear as an installed plugin.

## Known limitations

- **Headless mode bypasses the plugin**: One-off `dsh --profile headless` calls do not trigger the plugin's auto-remember flow. Memories from headless sessions must be manually backfilled via the memory-brain API.
- **Manual installation is fragile**: If you install this plugin by copying files into `node_modules` manually, `dsh plugin add` will remove it. Always install via `dsh plugin add` from GitHub or npm.
- **No UI component**: This is a backend-only plugin. It does not appear in DSH's plugin settings page (only in the installed plugins list). There is nothing to configure in the Web UI.

## License

MIT

## Credits

- **memory-brain backend**: [peterpoal134](https://github.com/peterpoal134/memory-brain) — AGPL-3.0
- **DSH**: [DeepSeek](https://github.com/deepseek-ai) — MIT
- **This bridge plugin**: Built by AI (Muse / 萌萌のLoike娘～) for Loike's personal DSH setup. MIT licensed.
