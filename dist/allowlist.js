/**
 * Allowed public documentation hosts (plan: docs.redhat.com + quarkus.io + subdomains of quarkus.io).
 */
const BASE = new Set([
    "docs.redhat.com",
    "www.docs.redhat.com",
    "quarkus.io",
    "www.quarkus.io",
]);
function isQuarkusFamily(hostname) {
    if (hostname === "quarkus.io" || hostname === "www.quarkus.io") {
        return true;
    }
    return (hostname.endsWith(".quarkus.io") &&
        // avoid typosquatting: must have at least one label before .quarkus.io
        !hostname.startsWith("."));
}
export function isAllowedDocHost(hostname, extra = []) {
    const h = hostname.toLowerCase();
    if (BASE.has(h)) {
        return true;
    }
    if (isQuarkusFamily(h)) {
        return true;
    }
    for (const e of extra) {
        if (e === h) {
            return true;
        }
    }
    return false;
}
/**
 * Reject non-HTTPS and credentials; allow only whitelisted hostnames.
 */
export function assertAllowedDocUrl(input, extraHosts = []) {
    let u;
    try {
        u = new URL(input);
    }
    catch {
        throw new Error("Invalid URL");
    }
    if (u.protocol !== "https:") {
        throw new Error("Only https:// URLs are allowed");
    }
    if (u.username || u.password) {
        throw new Error("URL must not contain credentials");
    }
    if (!isAllowedDocHost(u.hostname, extraHosts)) {
        throw new Error(`Host ${u.hostname} is not in the allowlist (docs.redhat.com, *.quarkus.io)`);
    }
    return u;
}
