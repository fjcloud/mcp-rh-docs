import { assertAllowedDocUrl } from "./allowlist.js";
import { config } from "./config.js";
const JINA_READER = "https://r.jina.ai/";
const cache = new Map();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 64;
function getCached(url) {
    const e = cache.get(url);
    if (e && Date.now() - e.at < CACHE_TTL_MS) {
        return e.value;
    }
    return undefined;
}
function setCache(url, value) {
    if (cache.size >= CACHE_MAX) {
        const first = cache.keys().next().value;
        if (first) {
            cache.delete(first);
        }
    }
    cache.set(url, { at: Date.now(), value });
}
/**
 * Fetches a public docs.redhat.com or quarkus.io page via Jina Reader (r.jina.ai).
 * Returns clean Markdown — no local HTML parsing needed.
 */
export async function fetchProductDoc(inputUrl, extraHosts = []) {
    const u = assertAllowedDocUrl(inputUrl, extraHosts);
    const href = u.href;
    const hit = getCached(href);
    if (hit) {
        return hit;
    }
    const jinaUrl = `${JINA_READER}${href}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), config.fetchTimeoutMs);
    let res;
    try {
        res = await fetch(jinaUrl, {
            signal: ac.signal,
            headers: {
                "User-Agent": config.userAgent,
                Accept: "text/plain",
            },
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Jina Reader request failed: ${msg}`);
    }
    finally {
        clearTimeout(t);
    }
    if (!res.ok) {
        throw new Error(`Jina Reader HTTP ${res.status} for ${href}`);
    }
    const text = await res.text();
    const parsed = parseJinaResponse(text, href);
    if (parsed.markdown.length > 1_200_000) {
        parsed.markdown = `${parsed.markdown.slice(0, 1_200_000)}\n\n… [truncated]`;
    }
    setCache(href, parsed);
    return parsed;
}
function parseJinaResponse(text, fallbackUrl) {
    const lines = text.split("\n");
    let title = fallbackUrl;
    let url = fallbackUrl;
    let publishedTime = null;
    let bodyStart = 0;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i];
        const m = line.match(/^Title:\s*(.+)$/);
        if (m) {
            title = m[1].trim();
            continue;
        }
        const u = line.match(/^URL Source:\s*(.+)$/);
        if (u) {
            url = u[1].trim();
            continue;
        }
        const p = line.match(/^Published Time:\s*(.+)$/);
        if (p) {
            publishedTime = p[1].trim();
            continue;
        }
        if (line.startsWith("Markdown Content:")) {
            bodyStart = i + 1;
            break;
        }
    }
    const markdown = lines.slice(bodyStart).join("\n").trim();
    return { title, url, publishedTime, markdown };
}
export function formatFetchResult(r) {
    const parts = [
        `# ${r.title}`,
        `**URL:** ${r.url}`,
    ];
    if (r.publishedTime) {
        parts.push(`**Published:** ${r.publishedTime}`);
    }
    parts.push("\n---\n");
    parts.push(r.markdown);
    return parts.join("\n");
}
