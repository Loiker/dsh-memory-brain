// dsh-memory-brain: wire memory-brain long-term memory into DSH backend.
// - Recall: on system-prompt/assemble, query memory-brain with the latest
//   user message and inject the hit block (~300 tokens) into the prompt.
// - Remember: on turn/end, store the user+assistant exchange via /remember.
// Fail-open: any memory-brain error must never break the agent turn.

import { readFileSync } from "node:fs";

export const name = "memory-brain";
export const inject = [];

const MB_URL = "http://127.0.0.1:8780";
const ENV_PATH = "/home/dsh/memory-brain/.memory-env";

let _token = null;
function token() {
  if (_token) return _token;
  if (process.env.MEMORY_BRAIN_TOKEN) {
    _token = process.env.MEMORY_BRAIN_TOKEN.trim();
    return _token;
  }
  try {
    const raw = readFileSync(ENV_PATH, "utf8");
    const m = raw.match(/MEMORY_TOKEN\s*=\s*(\S+)/);
    if (m) _token = m[1].trim();
  } catch {}
  return _token;
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c && c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n");
  }
  return "";
}

async function mbRecall(query) {
  const t = token();
  if (!t || !query || query.trim().length < 2) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${MB_URL}/recall`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: query.slice(0, 300) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data?.data?.hits;
    if (!Array.isArray(hits) || hits.length === 0) return null;
    let out = "【长期记忆·memory-brain】以下为与当前话题相关的长期记忆，供参考：\n";
    for (const h of hits.slice(0, 5)) {
      const txt = String(h.text || "").replace(/\s+/g, " ").slice(0, 140);
      if (txt) out += `- ${txt}\n`;
    }
    return out.length > 60 ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function mbRemember(text, kind) {
  const t = token();
  if (!t || !text || text.trim().length < 12) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    await fetch(`${MB_URL}/remember`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.slice(0, 600), kind: kind || "event" }),
      signal: ctrl.signal,
    });
  } catch {
    // fail-open
  } finally {
    clearTimeout(timer);
  }
}

export async function apply(context, config = {}) {
  const latest = new Map(); // agentId -> latest user message text
  const buffers = new Map(); // agentId -> [{role, text}] for current turn
  const disposers = [];

  // Track latest user message (for recall query)
  disposers.push(
    context.on("agent/inbox/claimed", ({ agent, message }) => {
      try {
        if (message?.source?.kind === "user") {
          const text = contentText(message.content);
          if (text && text.trim()) latest.set(String(agent.id), text);
        }
      } catch {}
    })
  );

  // Buffer turn messages + remember on turn end
  disposers.push(
    context.on("session/event", (session, event) => {
      try {
        const id = String(session?.id || session?.header?.id || "");
        if (!id) return;
        if (event.type === "turn/start") buffers.set(id, []);
        const message =
          event.type === "user/message" ? event.data : event.data?.message;
        const human =
          event.type === "user/message" && message?.source?.kind === "user";
        const assistant =
          event.type === "assistant/message" && !event.data?.interrupted;
        if (human || assistant) {
          const text = contentText(message?.content);
          if (text && text.trim()) {
            const list = buffers.get(id) || [];
            list.push({ role: human ? "user" : "assistant", text });
            buffers.set(id, list.slice(-10));
            if (human) latest.set(id, text);
          }
        }
        if (event.type === "turn/end") {
          const list = buffers.get(id) || [];
          buffers.delete(id);
          if (list.length >= 2) {
            const combined = list
              .map((m) =>
                `${m.role === "user" ? "主人" : "鱼鱼"}: ${m.text.slice(0, 220)}`
              )
              .join("\n");
            // fire-and-forget, never block
            mbRemember(combined, "event");
          }
        }
      } catch {}
    })
  );

  // Inject recalled memory into system prompt
  disposers.push(
    context.on("system-prompt/assemble", async (_assembly, ctx, next) => {
      const assembled = await next();
      try {
        const agent = ctx?.agent;
        if (!agent) return assembled;
        const id = String(agent.id);
        const query = latest.get(id) || "";
        const block = await mbRecall(query);
        if (block && Array.isArray(assembled.contexts)) {
          assembled.contexts.push({
            name: "memory-brain",
            order: 945,
            text: block,
            interpolate: false,
          });
        }
      } catch {}
      return assembled;
    })
  );

  context.on("dispose", async () => {
    for (const d of disposers) {
      try {
        if (typeof d === "function") await d();
      } catch {}
    }
  });
}
