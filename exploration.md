# Codebase Exploration Plan

## Purpose

Build a dependable mental model of `iti-grad`: what it does, how a request moves
through the API, where data is stored, how background jobs complete, and how the
service is deployed. This plan is intentionally ordered so that each stage makes
the next one easier to understand.

## Snapshot of the repository

This is a TypeScript/NestJS backend for campaign planning and generated marketing
content. Its main building blocks are:

| Area | Technology / location | Responsibility |
| --- | --- | --- |
| HTTP API | `src/main.ts`, `src/app.module.ts`, `src/modules/**` | NestJS bootstrap, validation, controllers, and business services |
| Authentication | `src/modules/auth/**` | Better Auth email/password and email-OTP flows backed by Prisma |
| Persistence | `prisma/schema.prisma`, `prisma/migrations/**` | PostgreSQL schema, relationships, and migration history |
| Background work | `src/modules/content/**`, `src/modules/strategy/**`, `src/modules/content-workflow/**` | BullMQ jobs for generation and long-running workflows |
| Workflow integration | `src/modules/mastra/**` | HTTP client for the separate Mastra workflow service |
| Mail delivery | `src/modules/email/**` | Nodemailer adapter used by verification/OTP operations |
| Local runtime | `docker-compose.yml`, `Dockerfile` | PostgreSQL, Redis, migration job, and API container |
| Deployment | `render.yaml`, `railway.toml` | Build, migration, health-check, and runtime configuration |

## Ground rules before exploring

1. Keep `.env` private; inspect variable names and validation rules, never copy
   credentials into notes or commits.
2. Start with read-only commands. Do not run destructive Prisma or Docker
   commands unless the task requires them.
3. Record assumptions separately from confirmed behavior. A controller comment
   is useful evidence, but tests and running behavior are stronger evidence.
4. Preserve existing uncommitted changes. Begin each session with `git status
   --short` and avoid formatting/rewrite commands unless explicitly needed.

## Phase 0 — Establish a reproducible baseline

### Goals

- Identify the branch, local changes, available services, and current test state.
- Confirm the project can build from its current schema.

### Read / run

```bash
git status --short
git branch --show-current
npm run build
npm run test -- --runInBand
npx prisma validate
```

### Capture

- Branch name and any uncommitted file list.
- Build/test result and number of test suites.
- Prisma schema validity.
- Any required environment variables that block local execution.

## Phase 1 — Map the application bootstrap and cross-cutting rules

### Read in order

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/config/configuration.ts`
4. `src/config/env.validation.ts`
5. `src/prisma/prisma.module.ts` and `src/prisma/prisma.service.ts`

### Questions to answer

- What request-size, validation, and transformation policies apply globally?
- Which modules are instantiated at startup and which external dependencies are
  mandatory (Postgres, Redis, SMTP, Mastra)?
- Which configuration values are raw environment variables versus nested config
  keys consumed by services?
- When and how is the database connection established?

### Output

Create a one-page runtime diagram such as:

```text
Browser / API client
        |
     NestJS API
   /     |      \
Postgres Redis   SMTP
           |
        BullMQ workers
           |
    External Mastra service
```

## Phase 2 — Understand identity, sessions, and ownership boundaries

### Read in order

1. `src/modules/auth/lib/auth.ts`
2. `src/modules/auth/auth.module.ts`
3. `src/modules/auth/auth.service.ts`
4. `src/modules/auth/auth.controller.ts`
5. `src/modules/auth/auth.guard.ts`
6. `src/modules/auth/current-user.decorator.ts`
7. `src/modules/auth/dto/email-auth.dto.ts`
8. `src/modules/email/email.service.ts`

### Trace these user journeys

- Register with email/password.
- Request and verify an email OTP.
- Sign in, retrieve a session, and sign out.
- Enter an authenticated controller and obtain `CurrentUser`.

### Questions to answer

- Which routes are public and which use `AuthGuard`?
- How do Better Auth `baseURL`, `trustedOrigins`, and cookies affect frontend
  integration?
- What SMTP settings are required to actually deliver an OTP?
- How does ownership travel from a user to project, campaign, strategy, content
  run, and generated content?

## Phase 3 — Model the database before reading feature services

### Read in order

1. `prisma/schema.prisma`
2. Every file in `prisma/migrations/`, oldest to newest.
3. The `PrismaService` from Phase 1.

### Build an entity map

```text
User
 └─ Project
     └─ Campaign
         ├─ GeneratedContent
         ├─ MarketingStrategy
         │   └─ CampaignContentRun
         └─ CampaignContentRun
             └─ GeneratedContent (fan-out association)
```

Also include Better Auth's `Session`, `Account`, and `Verification` models.

### Focus points

- Cascade and `SetNull` behavior when a project, campaign, strategy, or run is
  deleted.
- Status enums and the allowed lifecycle implied by code.
- JSON columns (`input`, `output`, `suspendPayload`, `payload`) and which
  integration owns their shape.
- Indexes that support user/campaign listing and workflow polling.

## Phase 4 — Explore the synchronous project and campaign API

### Read in order

1. `src/modules/projects/projects.controller.ts`
2. `src/modules/projects/projects.service.ts`
3. `src/modules/projects/dto/**`
4. `src/modules/campaigns/campaigns.controller.ts`
5. `src/modules/campaigns/campaigns.service.ts`
6. `src/modules/campaigns/dto/**`
7. Shared helpers in `src/common/**`

### Trace these scenarios

- Create/list/read/update/archive/unarchive/duplicate a project.
- Create/list/read/update/delete a campaign.
- Save a campaign as draft, publish it, and unpublish it.

### Record

- Route, auth requirement, request DTO, response shape, and important conflict
  conditions for every endpoint.
- Pagination defaults/limits and ownership checks.
- The exact behavior of project duplication and what data it copies.

## Phase 5 — Explore per-item content generation

### Read in order

1. `src/modules/content/content.module.ts`
2. `src/modules/content/content.controller.ts`
3. `src/modules/content/content.service.ts`
4. `src/modules/content/content-generation.queue.ts`
5. `src/modules/content/content-generation.processor.ts`
6. `src/modules/content/generator/content-generator.port.ts`
7. `src/modules/content/generator/placeholder-content-generator.ts`
8. `src/modules/content/content-export.service.ts`
9. `src/modules/content/dto/**`

### Trace the lifecycle

```text
POST generate/regenerate
  -> persist GeneratedContent as PENDING
  -> add BullMQ job with a revision
  -> processor calls generator
  -> conditional database write
  -> READY or FAILED
```

### Questions to answer

- How does `generationRevision` stop an old job from overwriting a newer edit?
- What happens when a user edits while a job is running?
- Which data is exportable and in which formats?
- Which generator is active today, and what replacement is expected for a real
  generation provider?

## Phase 6 — Explore strategy and full-content workflows

### Read in order

1. `src/modules/mastra/mastra.types.ts`
2. `src/modules/mastra/mastra.client.ts`
3. `src/modules/mastra/run-status.ts`
4. `src/modules/mastra/resume-request.ts`
5. `src/modules/strategy/**`
6. `src/modules/content-workflow/**`

### Trace both workflows

```text
Client starts run
  -> API validates ownership/input size
  -> database row is created (PENDING)
  -> Mastra run ID is reserved
  -> BullMQ worker starts or resumes remote workflow
  -> local row becomes RUNNING, READY, SUSPENDED, or FAILED
  -> successful content workflow fans calendar entries into GeneratedContent
```

### Focus points

- The difference between `MarketingStrategy` and `CampaignContentRun`.
- Why Mastra run IDs are reserved before enqueueing work.
- Queue failure handling, job-id idempotency, and worker failure events.
- Suspension/resume payloads and the conditions that permit a resume.
- How a `campaignStrategy` from a ready strategy is folded into a content run.
- How `calendar-fanout.ts` converts an untrusted workflow response into local
  content rows.

### Integration questions

- Where is the separate Mastra service hosted and how are its workflow IDs
  versioned?
- What response envelope does the remote service guarantee?
- Which workflow result fields should be treated as contracts versus opaque JSON?

## Phase 7 — Build an endpoint and state-transition reference

Create two exploration artifacts from Phases 2–6.

### Endpoint catalog

For each controller method, capture:

| Method/path | Auth | Input | Success | Failure modes | Side effects |
| --- | --- | --- | --- | --- | --- |

Group routes under `api/auth`, `projects`, `campaigns`, `contents`,
`strategies`, and `content-runs`.

### State-transition catalog

Document these status machines:

```text
GeneratedContent: PENDING -> READY | FAILED
MarketingStrategy: PENDING -> RUNNING -> READY | SUSPENDED | FAILED
CampaignContentRun: PENDING -> RUNNING -> READY | SUSPENDED | FAILED
```

For every arrow, note the responsible method/processor and its failure behavior.

## Phase 8 — Verify local infrastructure and operational behavior

### Read

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `render.yaml`
- `railway.toml`
- `README.md`

### Verify safely

```bash
docker compose config --quiet
docker compose ps --all
docker compose logs --tail=100 app migrate db redis
docker compose run --rm migrate
```

### Questions to answer

- Which container owns database migrations and when do they run?
- Which ports are exposed to the host versus used internally by Compose?
- How is Prisma generated in the build image and made available to the runtime
  image?
- Which environment variables must be set differently in local, Render, and
  Railway environments?
- What observability/health checks exist, and what signals are missing?

## Phase 9 — Test strategy and coverage gaps

### Read/run

```bash
npm run test -- --runInBand
npm run test:e2e
npm run test:cov
```

Inspect `src/app.controller.spec.ts` and `test/app.e2e-spec.ts` before drawing
conclusions from the results.

### Identify missing high-value coverage

- Auth: trusted origins, OTP delivery failure, session ownership.
- Projects/campaigns: ownership checks, publication restrictions, duplication.
- Queues: stale generation revisions, worker failure, lost enqueue operation.
- Workflows: success, suspension/resume, malformed Mastra envelope, campaign
  mismatch, and fan-out transaction behavior.
- Deployment: migration start ordering and required environment validation.

## Suggested exploration deliverables

By the end of the exploration, produce:

1. An architecture diagram and module dependency summary.
2. An entity-relationship and ownership diagram.
3. An authenticated endpoint catalog.
4. A state-machine diagram for generation and workflow runs.
5. A local-development runbook, including Docker, migrations, Redis port
   conflicts, SMTP, and Mastra configuration.
6. A ranked list of risks, unanswered questions, and test gaps.

## Recommended reading order summary

1. Bootstrap/configuration
2. Auth and email
3. Prisma schema/migrations
4. Projects and campaigns
5. Per-item content generation
6. Mastra, strategy, and content workflows
7. Docker/deployment
8. Tests and coverage

Following this order keeps foundational concerns (configuration, ownership, and
data) clear before reaching the asynchronous workflow logic that depends on
them.
