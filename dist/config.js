const userAgent = process.env.MCP_RH_DOCS_USER_AGENT?.trim() ||
    "mcp-rh-docs/1.0 (+https://github.com) MCP documentation fetcher";
const fetchTimeoutMs = (() => {
    const n = Number(process.env.MCP_RH_DOCS_FETCH_TIMEOUT_MS);
    if (Number.isFinite(n) && n > 0) {
        return Math.min(n, 120_000);
    }
    return 45_000;
})();
function extraAllowedHostsFromEnv() {
    const raw = process.env.MCP_RH_DOCS_EXTRA_HOSTS;
    if (!raw?.trim()) {
        return [];
    }
    return raw
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
}
export const config = {
    userAgent,
    fetchTimeoutMs,
    extraAllowedHostsFromEnv,
};
