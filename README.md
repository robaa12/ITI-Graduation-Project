# iti-grad

## Setup

```bash
npm install
cp .env.example .env
```

Fill in the SMTP settings with a real provider before testing email delivery.
The example's local values are sufficient for application startup, but its SMTP
endpoint does not deliver mail. Replace `BETTER_AUTH_SECRET` with a unique,
high-entropy secret in every non-local environment.

## Development

```bash
docker-compose up -d db redis
npm run start:dev
```

Redis backs the content-generation queue and is required to boot: set
`REDIS_HOST` (and `REDIS_PORT`, default `6379`, plus `REDIS_PASSWORD` if your
instance needs one) in your env file. `POST /campaigns/:id/contents/generate`
and `POST /contents/:id/regenerate` only enqueue — they answer `202` with a
`PENDING` row, and the worker flips it to `READY` or `FAILED`.

## Project knowledge RAG

Project knowledge is opt-in. Set `RAG_ENABLED=true` and a unique
`MASTRA_INTERNAL_TOKEN` (at least 24 characters) in both this service and
`marketing_demo`; then run the committed Prisma migrations and the
`project-knowledge` BullMQ worker with Redis available. Source indexing is
asynchronous, and only `READY` sources are eligible for retrieval.

Website sources are restricted to public HTTP(S) hosts, DNS-resolved before
each request, kept on the submitted host after redirects, checked against
`robots.txt`, and bounded by page/depth/text limits. Documents and official
social posts are indexed as supplied. Re-index sources whenever the embedding
model or `RAG_INDEX_VERSION` changes.

## Meta connectors and publishing

Meta configuration is optional at startup. Set `META_APP_ID`,
`META_APP_SECRET`, `META_REDIRECT_URI`, and a base64-encoded 32-byte
`META_TOKEN_ENCRYPTION_KEY` to enable OAuth. `META_LOGIN_CONFIG_ID` supports a
Facebook Login for Business configuration when the Meta app uses one. Keep the
Graph API version explicit with `META_GRAPH_API_VERSION`.

The authenticated connector API exposes:

- `GET /api/connectors/meta/status`
- `POST /api/connectors/meta/oauth/start`
- `GET /api/connectors/meta/oauth/callback`
- `POST /api/connectors/meta/sync`
- `PATCH /api/connectors/meta/accounts/:id`
- `DELETE /api/connectors/meta`

Tokens are AES-256-GCM encrypted and are never returned by the API. Scheduling
uses `POST /api/contents/:contentId/publications`; clients can list those rows,
cancel a queued publication, or explicitly retry a failed one. Only content
fanned out from a completed strategy-backed content workflow is publishable.
Instagram additionally requires a public HTTPS `imageUrl` in the generated
content payload.
