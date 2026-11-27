import fs from "node:fs";
import path from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

type Emit = (event: Record<string, unknown>) => void;
type Msg = { ts: string; user: string; text: string; thread?: string };
export type Slack = {
  anchor: string; // the day the snapshot was written for
  users: Record<string, string>;
  channels: Record<string, { name: string; private?: boolean; messages: Msg[] }>;
};

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({ ...text(message), isError: true });

// Fake Slack: a frozen snapshot so battle tests are repeatable. Sends are kept in memory only.
// Timestamps move forward by whole weeks so the snapshot stays recent and weekdays stay true.
export function loadSlack(fixture: string): Slack {
  const slack: Slack = JSON.parse(fs.readFileSync(fixture, "utf8"));
  const week = 7 * 86400000;
  const shift = Math.max(0, Math.floor((Date.now() - Date.parse(slack.anchor)) / week)) * week;
  if (!shift) return slack;
  const move = (ts: string) => new Date(Date.parse(`${ts}Z`) + shift).toISOString().slice(0, 16);
  for (const c of Object.values(slack.channels))
    for (const m of c.messages) {
      m.ts = move(m.ts);
      if (m.thread) m.thread = move(m.thread);
    }
  return slack;
}

export function slackServer(slack: Slack, owner: string) {
  const name = (id: string) => slack.users[id] ?? id;
  // Shaped like real Slack links (epoch seconds + 6 digits), not like dates the model might "fix".
  const link = (channel: string, ts: string) => `https://fake.slack/archives/${channel}/p${Date.parse(`${ts}Z`) / 1000}000100`;
  const show = (channel: string, m: Msg) => ({
    ts: m.ts,
    from: name(m.user),
    text: m.text.replace(/<@(\w+)>/g, (_, id) => `@${name(id)}`),
    ...(m.thread ? { reply_to: m.thread } : {}),
    link: link(channel, m.ts),
  });
  const find = (ref: string) =>
    Object.entries(slack.channels).find(([id, c]) => id === ref || c.name === ref.replace(/^#/, ""));
  const readable = () => Object.entries(slack.channels).filter(([, c]) => !c.private);

  return createSdkMcpServer({
    name: "slack",
    alwaysLoad: true,
    tools: [
      tool("list_channels", "List the Slack channels and DMs you can read.", {}, async () =>
        text(readable().map(([id, c]) => ({ id, name: c.name, messages: c.messages.length }))),
      ),
      tool(
        "read_channel",
        "Read messages in a channel or DM, oldest first. `since` is an ISO date or datetime.",
        { channel: z.string().describe("channel id or name, e.g. eng"), since: z.string().optional() },
        async ({ channel, since }) => {
          const hit = find(channel);
          if (!hit) return fail(`channel_not_found: ${channel}`);
          const [id, c] = hit;
          if (c.private) return fail(`not_in_channel: ${c.name} is private and you're not a member`);
          return text(c.messages.filter((m) => !since || m.ts >= since).map((m) => show(id, m)));
        },
      ),
      tool("search", "Search all readable messages for a word or phrase.", { query: z.string() }, async ({ query }) => {
        const q = query.toLowerCase();
        const found = readable().flatMap(([id, c]) =>
          c.messages
            .filter((m) => m.text.toLowerCase().includes(q) || name(m.user).toLowerCase().includes(q))
            .map((m) => ({ channel: c.name, ...show(id, m) })),
        );
        return text(found.length ? found : "no messages match");
      }),
      tool(
        "send_message",
        "Post a message as the owner. Needs the owner's approval.",
        {
          channel: z.string(),
          text: z.string(),
          reply_to: z.string().optional().describe("ts of the message to reply to in a thread"),
        },
        async ({ channel, text: body, reply_to }) => {
          const hit = find(channel);
          if (!hit) return fail(`channel_not_found: ${channel}`);
          const [id, c] = hit;
          const ts = new Date().toISOString().slice(0, 16);
          c.messages.push({ ts, user: owner, text: body, ...(reply_to ? { thread: reply_to } : {}) });
          return text({ ok: true, channel: c.name, ts, sent_text: body, link: link(id, ts) });
        },
      ),
    ],
  });
}

const fileName = z.string().describe("memory file, e.g. people.md");

const memoryPath = (dir: string, file: string) => path.join(dir, path.basename(file.endsWith(".md") ? file : `${file}.md`));

export function memoryServer(dir: string, mode: string, emit: Emit) {
  const tools = [
    tool(
      "remember",
      "Save one fact for later as a dated line in a memory file (created if missing).",
      { file: fileName, line: z.string() },
      async ({ file, line }) => {
        const p = memoryPath(dir, file);
        const entry = `- ${new Date().toISOString().slice(0, 10)}: ${line.replace(/^- /, "")}`;
        if (!fs.existsSync(p)) fs.writeFileSync(p, `# ${path.basename(p, ".md")}\n`);
        fs.appendFileSync(p, `${entry}\n`);
        emit({ type: "memory", action: "remember", file: path.basename(p), text: entry });
        return text(`saved to ${path.basename(p)}`);
      },
    ),
    tool(
      "edit_memory",
      "Change or remove text in a memory file. `old` must match exactly once; empty `new` removes it.",
      { file: fileName, old: z.string(), new: z.string() },
      async ({ file, old, new: replacement }) => {
        const p = memoryPath(dir, file);
        if (!fs.existsSync(p)) return fail(`no memory file ${path.basename(p)}`);
        const body = fs.readFileSync(p, "utf8");
        const count = body.split(old).length - 1;
        if (count !== 1) return fail(`"old" matched ${count} times; it must match exactly once`);
        fs.writeFileSync(p, body.replace(old, replacement).replace(/\n\n+/g, "\n"));
        emit({ type: "memory", action: "edit", file: path.basename(p), text: replacement || `removed: ${old}` });
        return text(`updated ${path.basename(p)}`);
      },
    ),
  ];
  tools.push(
    tool("read_memory", "Read a memory file listed in the index.", { file: fileName }, async ({ file }) => {
      const p = memoryPath(dir, file);
      return fs.existsSync(p) ? text(fs.readFileSync(p, "utf8")) : fail(`no memory file ${path.basename(p)}`);
    }),
  );
  return createSdkMcpServer({ name: "memory", alwaysLoad: true, tools });
}

// A new bot's memory: one file per kind, each with its description line.
const starter: Record<string, string> = {
  "me.md": "# Me: who the owner is and how they like things\n",
  "people.md": "# People: who's who and how to reach them\n",
  "loops.md": "# Loops: open promises and people waiting\n",
  "done.md": "# Done: closed loops and how they closed\n",
};

export function ensureMemory(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, body] of Object.entries(starter))
    if (!fs.existsSync(path.join(dir, file))) fs.writeFileSync(path.join(dir, file), body);
}

// Archive files are never pushed: they only grow, and are read on demand.
const archives = new Set(["done.md"]);

// What goes in <known>: everything but archives (push), an index (pull), or me.md plus an index (hybrid).
export function knownBlock(dir: string, mode: string) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8").trim();
  const index = (list: string[]) =>
    list.length
      ? "Memory files (read with read_memory):\n" +
        list.map((f) => `- ${f}: ${read(f).split("\n")[0].replace(/^#\s*/, "")}`).join("\n")
      : "";
  const full = (list: string[]) => list.map((f) => `<file name="${f}">\n${read(f)}\n</file>`).join("\n");
  const pushed = mode === "push" ? files.filter((f) => !archives.has(f)) : mode === "hybrid" ? ["me.md"] : [];
  return [full(pushed), index(files.filter((f) => !pushed.includes(f)))].filter(Boolean).join("\n");
}
