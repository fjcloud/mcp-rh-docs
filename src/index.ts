#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const JINA = "https://r.jina.ai/";
const TIMEOUT = 45_000;

const ALLOWED_HOSTS = [
  "docs.redhat.com",
  "quarkus.io",
  "access.redhat.com",
];

function validateUrl(input: string): string {
  const u = new URL(input); // throws on invalid
  if (u.protocol !== "https:") throw new Error("Only https:// URLs are allowed");
  const allowed = ALLOWED_HOSTS.some(
    (h) => u.hostname === h || u.hostname.endsWith(`.${h}`)
  );
  if (!allowed) throw new Error(`Host not allowed: ${u.hostname}. Allowed: ${ALLOWED_HOSTS.join(", ")}`);
  return u.href;
}

async function jinaFetch(url: string): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(`${JINA}${url}`, {
      signal: ac.signal,
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

// ── Tool: fetch a doc page ──────────────────────────────────────────────────

async function fetchDoc(url: string): Promise<string> {
  const href = validateUrl(url);
  const text = await jinaFetch(href);
  // Jina response: "Title: ...\nURL Source: ...\nMarkdown Content:\n<body>"
  const bodyStart = text.indexOf("Markdown Content:");
  const title = text.match(/^Title:\s*(.+)/m)?.[1] ?? href;
  const body = bodyStart >= 0 ? text.slice(bodyStart + "Markdown Content:".length).trim() : text;
  return `# ${title}\n**URL:** ${href}\n\n---\n\n${body}`;
}

// ── Tool: search ────────────────────────────────────────────────────────────

async function searchDocs(query: string, site: string): Promise<string> {
  const googleQuery = `${query} site:${site}`.replace(/\s+/g, "+");
  const text = await jinaFetch(`https://www.google.com/search?q=${googleQuery}`);

  // Jina renders Google results as: ### [Title...](https://actual-url)
  const re = /^###\s+\[(.+)\]\((https:\/\/[^)]+)\)\s*$/gm;
  const seenUrls = new Set<string>();
  const results: string[] = [];
  let i = 1;

  for (const m of text.matchAll(re)) {
    const url = m[2];
    if (url.includes("#:~:text=") || seenUrls.has(url)) continue;
    seenUrls.add(url);

    const title = m[1]
      .replace(/\s*!\[Image \d+\]\([^)]*\)\s*/g, "")
      .replace(/\s*Red Hat Documentation.*$/, "")
      .replace(/\s*Quarkus Documentation.*$/, "")
      .trim();

    results.push(`${i}. ${title}\n   ${url}`);
    i++;
    if (i > 8) break;
  }

  return results.length
    ? `Results for "${query}" on ${site}:\n\n${results.join("\n\n")}`
    : `No results found for "${query}" on ${site}.`;
}

// ── MCP server ──────────────────────────────────────────────────────────────

const server = new McpServer({ name: "mcp-rh-docs", version: "1.0.0" });

server.registerTool(
  "fetch_rh_doc",
  {
    description: `Fetch a Red Hat or Quarkus documentation page and return it as Markdown. Allowed hosts: ${ALLOWED_HOSTS.join(", ")}.`,
    inputSchema: { url: z.string().describe("https URL of the doc page") },
  },
  async ({ url }) => {
    try {
      return { content: [{ type: "text" as const, text: await fetchDoc(url) }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : e}` }], isError: true };
    }
  }
);

server.registerTool(
  "search_rh_docs",
  {
    description: "Search Red Hat or Quarkus documentation via Google (no API key needed).",
    inputSchema: {
      query: z.string().describe("Search terms"),
      site: z.enum(["docs.redhat.com", "quarkus.io", "access.redhat.com"])
        .optional()
        .describe("Limit search to this site (default: docs.redhat.com)"),
    },
  },
  async ({ query, site }) => {
    try {
      return { content: [{ type: "text" as const, text: await searchDocs(query, site ?? "docs.redhat.com") }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : e}` }], isError: true };
    }
  }
);

process.on("uncaughtException", (err) => {
  console.error("[mcp-rh-docs] uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[mcp-rh-docs] unhandledRejection:", reason);
  process.exit(1);
});

console.error("[mcp-rh-docs] starting…");
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[mcp-rh-docs] connected, waiting for requests");
