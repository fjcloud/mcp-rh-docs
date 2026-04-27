# mcp-rh-docs

MCP server that gives AI assistants access to **Red Hat documentation** — docs.redhat.com, access.redhat.com, and quarkus.io.

No API keys required. Uses [Jina Reader](https://jina.ai/reader/) to fetch and search.

## Tools

| Tool | What it does |
|------|-------------|
| `fetch_rh_doc` | Fetch any doc page and return it as Markdown |
| `search_rh_docs` | Search via Google scoped to a doc site |

## Setup

```bash
git clone https://github.com/redhat-developer/mcp-rh-docs
cd mcp-rh-docs
npm install   # also compiles dist/
```

Then add to your Cursor MCP config (see [`mcp.json.example`](mcp.json.example)).

## Usage examples

```
fetch_rh_doc("https://docs.redhat.com/en/documentation/red_hat_openshift_pipelines/1.21/html/securing_openshift_pipelines/signing-secrets-in-tekton-chains_using-tekton-chains-for-openshift-pipelines-supply-chain-security")

search_rh_docs("cosign openshift pipeline", "docs.redhat.com")

search_rh_docs("dependency injection", "quarkus.io")
```
