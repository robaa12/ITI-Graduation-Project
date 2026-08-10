# AetherFlow workflow engine

This local development service implements the workflow HTTP contract used by
the Nest API. It supplies the two registered workflow IDs:

- `marketingStrategyWorkflow`
- `contentCreationWorkflow`

It intentionally has no third-party dependencies or API-key requirement. The
plans are deterministic, brief-aware starting points so the full application
can run locally while the production Mastra workflow is unavailable.

## Run locally

```bash
npm run dev
```

From the Nest project root, `npm run start:dev` starts this service and the
Nest API together. Use `npm run start:workflow` when you only need the
workflow service.

The service listens on `http://localhost:4111` by default. Set `PORT` to use a
different port, then update `MASTRA_BASE_URL` in the Nest app's `.env` to
match. Docker Compose uses the production Mastra service on its private
network; this engine remains a dependency-free local development fallback.

## Verify

```bash
curl http://localhost:4111/health
npm test
```
