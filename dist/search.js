import { config } from "./config.js";
const JINA_READER = "https://r.jina.ai/";
const SITE_PATTERNS = {
    redhat: { host: "docs.redhat.com" },
    quarkus: { host: "quarkus.io" },
};
/**
 * Search via Jina Reader proxying Google search (site: operator, no API key needed).
 * Returns titles, URLs and snippets extracted from the Google results Markdown.
 */
export async function searchProductDocs(options) {
    const q = options.query.trim();
    if (!q) {
        return "Error: query must not be empty";
    }
    const max = Math.min(Math.max(1, Math.floor(options.maxResults)), 10);
    if (options.site === "both") {
        const [a, b] = await Promise.all([
            runGoogleSearch(q, "redhat", max),
            runGoogleSearch(q, "quarkus", max),
        ]);
        if (typeof a === "string") {
            return a;
        }
        if (typeof b === "string") {
            return b;
        }
        const merged = dedup([...a, ...b]).slice(0, max * 2);
        return formatResults(q, merged);
    }
    const r = await runGoogleSearch(q, options.site, max);
    if (typeof r === "string") {
        return r;
    }
    return formatResults(q, r);
}
async function runGoogleSearch(q, site, max) {
    const { host } = SITE_PATTERNS[site];
    // Use + for spaces so the URL stays readable and Jina doesn't double-encode %20
    const googleQuery = `${q} site:${host}`.replace(/\s+/g, "+");
    const googleUrl = `https://www.google.com/search?q=${googleQuery}`;
    const jinaUrl = `${JINA_READER}${googleUrl}`;
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
        return `Search request failed: ${msg}`;
    }
    finally {
        clearTimeout(t);
    }
    if (!res.ok) {
        return `Search HTTP error ${res.status} from Jina Reader`;
    }
    const text = await res.text();
    return extractResults(text, site, max);
}
function extractResults(text, source, max) {
    const lines = text.split("\n");
    const results = [];
    const seenUrls = new Set();
    // Jina renders Google results as:
    //   ### [Title ... ![ImageN](blob:...) Site breadcrumb](https://actual-url)
    // The LAST ](url) on the line is the actual result link.
    // We can't use [^\]]* because the title bracket contains nested image markdown.
    // Strategy: capture the last (https://...) on the line as the URL,
    // then everything before it (minus the closing bracket) as the title block.
    const titleLineRe = /^###\s+\[(.+)\]\((https:\/\/[^)]+)\)\s*$/;
    for (let i = 0; i < lines.length && results.length < max; i++) {
        const line = lines[i];
        const m = line.match(titleLineRe);
        if (!m) {
            continue;
        }
        // The link URL is the actual result URL (Google wraps in h3 > a)
        const url = m[2].trim();
        // Skip fragment-only variants
        if (url.includes("#:~:text=")) {
            continue;
        }
        if (seenUrls.has(url)) {
            continue;
        }
        seenUrls.add(url);
        // Clean up the title: strip inline images, trailing breadcrumb noise
        let title = m[1]
            .replace(/\s*!\[Image \d+\]\([^)]*\)\s*/g, "")
            .replace(/\s*(?:Red Hat Documentation|Quarkus Documentation)[^[]*$/, "")
            .replace(/\s+https?:\/\/\S+.*$/, "")
            .replace(/\s{2,}/g, " ")
            .trim();
        if (!title) {
            title = url;
        }
        // Snippet: first non-empty, non-heading, non-site-name line after the heading
        let snippet = "";
        for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
            const l = lines[j].trim();
            if (!l || l.startsWith("#") || /^Red Hat Documentation|^Quarkus$|^https?:\/\/docs\.redhat\.com\s*›/.test(l)) {
                continue;
            }
            // Strip "Read more" link appended at the end of snippets
            snippet = l
                .replace(/\[Read more\]\([^)]*\)/g, "")
                .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
                .replace(/[_*`]/g, "")
                .trim()
                .slice(0, 220);
            if (snippet) {
                break;
            }
        }
        results.push({ title, url, snippet, source });
    }
    return results;
}
function dedup(items) {
    const seen = new Set();
    return items.filter((it) => {
        if (seen.has(it.url)) {
            return false;
        }
        seen.add(it.url);
        return true;
    });
}
function formatResults(query, items) {
    if (items.length === 0) {
        return [
            `No results found for: ${query}`,
            "",
            "Tip: try fetch_product_doc with a direct https://docs.redhat.com/… or https://quarkus.io/guides/… URL.",
        ].join("\n");
    }
    const parts = [
        `Search results for: ${query}`,
        `Found ${items.length} result(s)`,
        "",
    ];
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        parts.push(`${i + 1}. [${it.source}] ${it.title}`);
        parts.push(`   ${it.url}`);
        if (it.snippet) {
            parts.push(`   ${it.snippet}`);
        }
        parts.push("");
    }
    return parts.join("\n").trimEnd();
}
