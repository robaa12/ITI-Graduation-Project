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
