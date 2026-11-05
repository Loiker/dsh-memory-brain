# dsh-memory-brain

Wire [memory-brain](https://github.com/peterpoal134/memory-brain) long-term memory into the DSH backend.

## What it does

- **Before each reply**: recalls relevant memories from memory-brain and injects them into the prompt (five-way hybrid retrieval, only relevant ones — keeps context small and token-cheap).
- **After each reply**: automatically saves the conversation turn to memory-brain.

Without it, DSH has no long-term memory: in-session context only, restart = amnesia, no identity continuity.

## How it works

The plugin hooks into DSH's prompt lifecycle:

1. `recall` — POST to memory-brain's `/recall` endpoint with the user's message, get relevant memories back, inject them into the system prompt.
2. `remember` — POST to memory-brain's `/remember` endpoint with the conversation turn, save it for later.

## Configuration

Set these environment variables (or edit `dist/dsh/plugin.js` directly):

- `MEMORY_BRAIN_URL` — memory-brain API base URL (default: `http://127.0.0.1:8780`)
- `MEMORY_BRAIN_TOKEN` — memory-brain API token

## Installation

```bash
dsh plugin add dsh-memory-brain
```

Or install from this repo:

```bash
dsh plugin add https://github.com/Loiker/dsh-memory-brain
```

## License

MIT
