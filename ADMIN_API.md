# Admin API

This document describes the admin endpoints exposed by the backend. It covers
the admin user-management extension (delete, search/filter/sorting,
statistics, and profile updates), the dashboard overview statistics, project
management, knowledge management, campaign management, workflow execution
management & accounting, social publications management, billing &
subscriptions administration, strategy administration, content administration,
and social connector administration.

## Authentication

Every endpoint in this document is protected by `AdminGuard`. The request must
carry a valid Better Auth session cookie for a user whose `role` is `ADMIN`.
Non-admin sessions and unauthenticated requests are rejected.

Send cookies on every request:

```ts
const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
  credentials: 'include',
});
```

Possible guard errors:

| Status | Situation |
| --- | --- |
| `401` | No valid session (`Authentication required`) |
| `403` | Session exists but the user is not an admin (`Admin access required`) |

## Base URL

All admin user endpoints use the global `/api` prefix:

```text
http://localhost:3000/api/admin/users
```

## Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/users` | List users with search, filter, sorting, pagination |
| `GET` | `/api/admin/users/statistics` | Total users and users grouped by role |
| `GET` | `/api/admin/users/:id` | Get one user |
| `PATCH` | `/api/admin/users/:id` | Update a user's profile (name/image) |
| `PATCH` | `/api/admin/users/:id/role` | Change a user's role |
| `DELETE` | `/api/admin/users/:id` | Delete a user (blocked for self-deletion) |

## Roles

The `role` field is stored as a database enum with two values:

| Value | Meaning |
| --- | --- |
| `USER` | Regular user |
| `ADMIN` | Administrator |

## Common response models

### User

```json
{
  "id": "usr_01JABC123",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "emailVerified": true,
  "image": null,
  "role": "USER",
  "createdAt": "2026-08-03T15:00:00.000Z",
  "updatedAt": "2026-08-03T15:05:00.000Z",
  "generationCreditsUsed": 2,
  "generationCreditLimit": 10,
  "generationCreditPlanCode": "pro-monthly",
  "generationCreditPeriodStart": "2026-08-01T00:00:00.000Z",
  "generationCreditPeriodEnd": "2026-08-31T23:59:59.000Z"
}
```

`image`, `generationCreditPlanCode`, `generationCreditPeriodStart`, and
`generationCreditPeriodEnd` can be `null`.

### Paginated list

```json
{
  "data": [ { "id": "usr_01JABC123", "name": "Jane Doe" } ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

`total` is the number of users matching the current filters (not the whole
table), and `totalPages = ceil(total / limit)`.

### Error

NestJS validation and HTTP errors use this shape:

```json
{
  "statusCode": 400,
  "message": "role must be one of the following values: USER, ADMIN",
  "error": "Bad Request"
}
```

## Endpoints

### 1. List users

```http
GET /api/admin/users
```

Returns a paginated list of users. Every option is optional; an empty query
returns the newest users first.

#### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `search` | `string` | – | Case-insensitive match on name **or** email |
| `role` | `string` | – | `USER` or `ADMIN` |
| `sortBy` | `string` | `createdAt` | `name`, `email`, `createdAt`, or `updatedAt` |
| `sortOrder` | `string` | `DESC` | `ASC` or `DESC` |

Search and filtering are applied at the database level.

#### Example requests

```http
GET /api/admin/users?page=2&limit=10&role=ADMIN
```

```http
GET /api/admin/users?search=jane&sortBy=email&sortOrder=ASC
```

#### Success response

```json
{
  "data": [
    {
      "id": "usr_01JABC123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "emailVerified": true,
      "image": null,
      "role": "ADMIN",
      "createdAt": "2026-08-03T15:00:00.000Z",
      "updatedAt": "2026-08-03T15:05:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

#### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, `role`, `sortBy`, or `sortOrder` |

### 2. Get user statistics

```http
GET /api/admin/users/statistics
```

Returns the total number of users and the count grouped by role. Derived
directly from the database using aggregates (no full-table load).

#### Success response

```json
{
  "totalUsers": 42,
  "byRole": {
    "ADMIN": 2,
    "USER": 40
  }
}
```

#### Possible errors

None. The endpoint always succeeds for an authorized admin.

### 3. Get one user

```http
GET /api/admin/users/:id
```

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The user's unique ID |

#### Success response

A single [User](#user) object.

#### Possible errors

| Status | Situation |
| --- | --- |
| `404` | `User with ID <id> not found` |

### 4. Update a user's profile

```http
PATCH /api/admin/users/:id
```

Updates the editable profile fields. Only the fields provided are changed.

#### Request body

```json
{
  "name": "Jane Doe Updated",
  "image": "https://example.com/avatar.png"
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | `string` | No | Max 120 characters |
| `image` | `string` | No | Max 2000 characters |

#### Success response

A single [User](#user) object with the updated fields.

#### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid or unexpected body fields |
| `404` | `User with ID <id> not found` |

### 5. Change a user's role

```http
PATCH /api/admin/users/:id/role
```

#### Request body

```json
{
  "role": "ADMIN"
}
```

| Field | Type | Required | Allowed values |
| --- | --- | --- | --- |
| `role` | `string` | Yes | `USER` or `ADMIN` |

#### Success response

A single [User](#user) object with the updated `role`.

#### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid role value (must be `USER` or `ADMIN`) |
| `404` | `User with ID <id> not found` |

### 6. Delete a user

```http
DELETE /api/admin/users/:id
```

An admin can delete a user that owns no business records. Deleting a user who
still owns related business records is rejected so that historical or business
data is never destroyed implicitly.

#### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The user's unique ID |

#### Success response

```json
{
  "id": "usr_01JABC123",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "role": "USER",
  "deleted": true
}
```

#### Self-deletion protection

Admins cannot delete their own account. Deleting the authenticated admin's own
ID returns `400` with `Admins cannot delete their own account`.

#### Possible errors

| Status | Situation |
| --- | --- |
| `400` | The target ID is the authenticated admin's own ID |
| `404` | `User with ID <id> not found` |
| `409` | The account still owns projects, social connections, subscriptions, or generation-credit events |

Example `409` response:

```json
{
  "statusCode": 409,
  "message": "Cannot delete user \"jane@example.com\": the account still owns related business records (2 project(s), 0 social connection(s), 0 subscription(s), 0 credit event(s)). Archive or transfer them before deleting the user.",
  "error": "Conflict"
}
```

## Notes

- There is no `create user` admin endpoint; accounts are created through the
  authentication flow.
- The previous `PATCH /api/admin/users/:id/status` route was removed because the
  `User` model has no `status` field; profile updates go through
  `PATCH /api/admin/users/:id`.
- Deleting a clean account relies on the existing `onDelete: Cascade`
  relations for account plumbing (sessions, accounts, one-time OAuth states).

# Dashboard Overview API

## Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/dashboard/overview` | High-level statistics across all major resources |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

## Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `from` | ISO-8601 date | last 30 days | `YYYY-MM-DD` or full timestamp |
| `to` | ISO-8601 date | last 30 days | `YYYY-MM-DD` or full timestamp |

The window only affects the **windowed** metrics (`users.new`, `projects.recent`).
All other figures are all-time totals. Range resolution:

- Neither bound: the last 30 days.
- Only `from`: `to` is now.
- Only `to`: `from` is 30 days before `to`.
- Both: used as-is, with `400` if `from` is later than `to`.

The effective window is echoed in the response as `range`.

## Response structure

```json
{
  "range": { "from": "2026-07-17T00:00:00.000Z", "to": "2026-08-16T12:00:00.000Z" },
  "users": {
    "total": 42,
    "new": 5,
    "verified": 30,
    "unverified": 12,
    "byRole": [ { "role": "USER", "count": 40 }, { "role": "ADMIN", "count": 2 } ]
  },
  "projects": {
    "total": 8,
    "recent": 2,
    "byStatus": [ { "status": "ACTIVE", "count": 7 }, { "status": "ARCHIVED", "count": 1 } ]
  },
  "subscriptions": {
    "total": 10,
    "active": 6,
    "canceled": 2,
    "paused": 0,
    "byStatus": [ { "status": "ACTIVE", "count": 6 }, { "status": "INCOMPLETE", "count": 2 } ],
    "byPlan": [ { "planCode": "pro", "count": 4 }, { "planCode": null, "count": 6 } ],
    "planChangeRevenueCents": 4500,
    "chargedPlanChanges": 3
  },
  "workflows": {
    "total": 120,
    "successful": 90,
    "failed": 20,
    "pending": 10,
    "byStatus": [ { "status": "READY", "count": 90 }, { "status": "FAILED", "count": 20 } ],
    "byKind": [ { "kind": "STRATEGY", "count": 50 }, { "kind": "CONTENT", "count": 70 } ]
  },
  "content": {
    "total": 300,
    "byStatus": [ { "status": "READY", "count": 280 }, { "status": "PENDING", "count": 20 } ]
  },
  "knowledge": {
    "total": 15,
    "pages": 60,
    "byType": [ { "type": "WEBSITE", "count": 10 }, { "type": "DOCUMENT", "count": 5 } ],
    "byStatus": [ { "status": "READY", "count": 12 }, { "status": "PENDING", "count": 3 } ]
  },
  "social": {
    "publications": 40,
    "publicationsByStatus": [ { "status": "PUBLISHED", "count": 30 }, { "status": "SCHEDULED", "count": 10 } ],
    "connections": 5,
    "accounts": 9,
    "accountsByPlatform": [ { "platform": "FACEBOOK", "count": 5 }, { "platform": "INSTAGRAM", "count": 4 } ]
  },
  "strategies": {
    "total": 12,
    "byStatus": [ { "status": "READY", "count": 8 }, { "status": "PENDING", "count": 4 } ],
    "byApprovalStatus": [ { "approvalStatus": "APPROVED", "count": 6 }, { "approvalStatus": "PENDING_REVIEW", "count": 6 } ]
  },
  "campaigns": {
    "total": 15,
    "byStatus": [ { "status": "DRAFT", "count": 10 }, { "status": "PUBLISHED", "count": 5 } ]
  }
}
```

## Meaning of important statistics

| Field | Meaning |
| --- | --- |
| `users.total` | All-time registered users |
| `users.new` | Users registered inside the requested window |
| `users.verified` / `unverified` | All-time split by `emailVerified` |
| `projects.total` / `recent` | All-time projects / created inside the window |
| `subscriptions.active/canceled/paused` | All-time counts by subscription status |
| `subscriptions.planChangeRevenueCents` | Sum of `amountDueCents` of consumed plan-change quotes (actual money moved through the app, in cents) |
| `workflows.successful/failed/pending` | Execution status READY / FAILED / PENDING+RUNNING+SUSPENDED |
| `knowledge.pages` | Crawled pages under website knowledge sources |
| `social.publications` | All publications; breakdown by status |
| `social.connections` | Provider-level connections |
| `social.accounts` | Connected pages/professional accounts |

## Notes

- "Active users" is intentionally not reported: the `User` schema has no
  activity/last-seen column, so it cannot be derived from the database.
- Initial Stripe subscription charges are not stored as monetary rows in this
  schema, so they are excluded from revenue rather than guessed. Only
  consumed plan-change quotes are summed.
- Every figure is computed with Prisma `count` / `groupBy` / `aggregate`
  queries (no full-table loads) and independent queries run in parallel.

# Project Management API

## Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/projects` | List projects with search, filter, sorting, pagination |
| `GET` | `/api/admin/projects/:id` | Get one project with owner and relation summaries |
| `PATCH` | `/api/admin/projects/:id` | Update a project's editable fields / status |
| `DELETE` | `/api/admin/projects/:id` | Delete a project (only when it has no dependent records) |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

## List projects

```http
GET /api/admin/projects
```

Returns a paginated list of projects. Every option is optional; an empty query
returns the newest projects first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `search` | `string` | – | Case-insensitive match on project name **or** owner name/email |
| `status` | `string` | – | `ACTIVE` or `ARCHIVED` |
| `ownerId` | `string` | – | UUID of the owning user |
| `sortBy` | `string` | `createdAt` | `name`, `createdAt`, or `updatedAt` |
| `sortOrder` | `string` | `DESC` | `ASC` or `DESC` |

Search and filtering are applied at the database level. Pagination uses
`LIMIT`/`OFFSET`; only the requested page is loaded.

### Success response

```json
{
  "data": [
    {
      "id": "3f0c...",
      "name": "Acme launch",
      "description": null,
      "status": "ACTIVE",
      "archivedAt": null,
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-10T12:30:00.000Z",
      "owner": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
      "campaignCount": 4,
      "knowledgeSourceCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

The `owner` object is the owning user (id, name, email). `campaignCount` and
`knowledgeSourceCount` are aggregate counts over the project's relations.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, `status`, `ownerId`, `sortBy`, or `sortOrder` |

## Get one project

```http
GET /api/admin/projects/:id
```

Returns the project together with its owner, brand profile, and aggregate
counts for the relations hanging off it. The summaries are computed with
separate `count` queries (no relation payloads are loaded), so large projects
never produce huge nested responses.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The project's UUID |

### Success response

```json
{
  "id": "3f0c...",
  "name": "Acme launch",
  "description": "Q3 go-to-market",
  "status": "ACTIVE",
  "archivedAt": null,
  "brandProfile": { "voice": "Confident and concise", "preferredTerms": ["acme"] },
  "createdAt": "2026-08-01T09:00:00.000Z",
  "updatedAt": "2026-08-10T12:30:00.000Z",
  "owner": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
  "summary": {
    "campaigns": 4,
    "knowledgeSources": 2,
    "strategies": 3,
    "contents": 18,
    "workflowExecutions": 12
  }
}
```

`brandProfile` is `null` when the project has no brand profile. The `summary`
counts are:

| Field | Meaning |
| --- | --- |
| `campaigns` | Campaigns owned by the project |
| `knowledgeSources` | Knowledge sources attached to the project |
| `strategies` | Marketing strategies under the project's campaigns |
| `contents` | Generated content under the project's campaigns |
| `workflowExecutions` | Workflow executions (strategy or content runs) under the project's campaigns |

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Project with ID <id> not found` |

## Update a project

```http
PATCH /api/admin/projects/:id
```

Updates the editable fields. Only the fields provided are changed; timestamps,
ownership, and system-managed fields are never writable. The `name`,
`description`, and `brandProfile` rules are identical to the user-facing
project update endpoint.

### Request body

```json
{
  "name": "Acme launch revamped",
  "description": "Updated Q3 go-to-market",
  "brandProfile": { "voice": "Bold", "preferredTerms": ["acme"], "prohibitedTerms": [], "writingRules": [] },
  "status": "ARCHIVED"
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | `string` | No | Between 1 and 120 characters |
| `description` | `string` | No | Max 2000 characters |
| `brandProfile` | `object` | No | Validated with the shared `BrandProfileDto` rules |
| `status` | `string` | No | `ACTIVE` or `ARCHIVED` |

Changing `status` follows the existing archive/unarchive lifecycle:
`ARCHIVED` sets `archivedAt`, `ACTIVE` clears it. Setting the status the
project already has returns `409`.

### Success response

The updated [project](#get-one-project) core fields (without owner/summary).

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid or unexpected body fields |
| `404` | `Project with ID <id> not found` |
| `409` | `Project is already active/archived` |

## Delete a project

```http
DELETE /api/admin/projects/:id
```

Deleting a project cascades in the schema through campaigns, generated
content, strategies, workflow executions, knowledge sources, and social
publications. To avoid silently destroying historical data, deletion is only
allowed when the project has **no** campaigns and **no** knowledge sources.
Otherwise the request fails with `409` and tells the admin to archive the
project instead.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The project's UUID |

### Success response

```json
{
  "id": "3f0c...",
  "name": "Empty scratch project",
  "deleted": true
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Project with ID <id> not found` |
| `409` | The project still contains campaigns or knowledge sources |

Example `409` response:

```json
{
  "statusCode": 409,
  "message": "Cannot delete project \"Acme launch\": it still contains 4 campaign(s) and 2 knowledge source(s). Archive the project instead of deleting it.",
  "error": "Conflict"
}
```

## Notes

- There is no admin `create project` endpoint: projects are created by their
  owner through the user-facing flow, which also provisions the initial
  campaign.
- The previous untyped `GET/PATCH/DELETE /api/admin/projects*` handlers were
  replaced by this module; the old `DELETE` behavior of silently archiving a
  project when it had campaigns was removed in favor of an explicit `409`.

## Knowledge management

Admin endpoints to inspect and manage project knowledge sources and their
crawled pages. The module lives under `/api/admin/knowledge` and reuses the
existing user-facing knowledge flow (URL safety/SSRF checks, crawler and
indexing queue), so admin operations never bypass the protections the
application enforces for normal users.

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/knowledge/sources` | List knowledge sources with filters, sorting, pagination |
| `GET` | `/api/admin/knowledge/sources/:id` | Get one source with project owner and crawl metadata |
| `POST` | `/api/admin/knowledge/sources` | Create a website source and queue its first index |
| `PATCH` | `/api/admin/knowledge/sources/:id` | Update a source's name / website URL |
| `DELETE` | `/api/admin/knowledge/sources/:id` | Delete a source (cascades pages, removes vector index) |
| `POST` | `/api/admin/knowledge/sources/:id/refresh` | Reset to pending and queue a recrawl + re-index |
| `GET` | `/api/admin/knowledge/pages` | List crawled pages with filters, sorting, pagination |
| `GET` | `/api/admin/knowledge/pages/:id` | Get one page with its source and owning project |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

### Response conventions

Paginated list responses use the shared shape:

```json
{
  "data": [ { "id": "3f0c...", "name": "Acme docs" } ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Raw source/page text is only returned where it is the point of the endpoint
(the page detail). Source responses carry crawl/indexing `metadata` (chunk
count, embedding provider/model, index version, content hash) but never the
stored source `content`, keeping responses lean.

## List knowledge sources

```http
GET /api/admin/knowledge/sources
```

Returns a paginated list of knowledge sources. Every option is optional; an
empty query returns the newest sources first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `search` | `string` | – | Case-insensitive match on source name, URL, or project name |
| `type` | `string` | – | `WEBSITE`, `DOCUMENT`, `FACEBOOK`, or `INSTAGRAM` |
| `status` | `string` | – | `PENDING`, `INDEXING`, `READY`, or `FAILED` |
| `projectId` | `string` | – | UUID of the owning project |
| `from` | `string` | – | ISO date; sources created on/after this date |
| `to` | `string` | – | ISO date; sources created on/before this date |
| `sortBy` | `string` | `createdAt` | `name`, `type`, `status`, `url`, `createdAt`, `updatedAt`, `indexedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`; when
`sortBy` is given without `sortOrder`, ordering is `ASC`.

### Success response

```json
{
  "data": [
    {
      "id": "3f0c...",
      "type": "WEBSITE",
      "status": "READY",
      "name": "Acme docs",
      "url": "https://docs.example.com",
      "error": null,
      "indexedAt": "2026-08-10T12:30:00.000Z",
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-10T12:30:00.000Z",
      "project": { "id": "p_01JABC123", "name": "Acme launch" },
      "pageCount": 12,
      "freshness": { "status": "fresh", "checkedAt": "2026-08-10T12:30:00.000Z", "refreshAfter": "2026-08-17T12:30:00.000Z", "maxAgeDays": 7 }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`freshness` is derived with the same logic as the user-facing source list:
`error` for failed sources, `never-indexed` for pending sources, and
`stale`/`fresh` otherwise (with `refreshAfter` and `maxAgeDays`).

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, `type`, `status`, `projectId`, `sortBy`, `sortOrder`, or `from` later than `to` |

## Get one knowledge source

```http
GET /api/admin/knowledge/sources/:id
```

Returns the source together with its project owner and crawl/indexing
metadata.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The knowledge source's UUID |

### Success response

```json
{
  "id": "3f0c...",
  "type": "WEBSITE",
  "status": "READY",
  "name": "Acme docs",
  "url": "https://docs.example.com",
  "metadata": { "chunkCount": 96, "embeddingProvider": "openai", "embeddingModel": "text-embedding-3-small", "indexVersion": 1, "contentHash": "5e8848...", "lastCheckedAt": "2026-08-10T12:30:00.000Z", "pageCount": 12, "crawlWarnings": [] },
  "error": null,
  "indexedAt": "2026-08-10T12:30:00.000Z",
  "createdAt": "2026-08-01T09:00:00.000Z",
  "updatedAt": "2026-08-10T12:30:00.000Z",
  "project": {
    "id": "p_01JABC123",
    "name": "Acme launch",
    "owner": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" }
  },
  "pageCount": 12,
  "freshness": { "status": "fresh", "checkedAt": "2026-08-10T12:30:00.000Z", "refreshAfter": "2026-08-17T12:30:00.000Z", "maxAgeDays": 7 }
}
```

`metadata` is `null` until the source is indexed.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Knowledge source with ID <id> not found` |

## Create a knowledge source

```http
POST /api/admin/knowledge/sources
```

Creates a website source and returns `202` because the first indexing run is
queued asynchronously. The URL goes through the same validation as the
user-facing flow: it must be a public http(s) URL and resolve exclusively to
public addresses (SSRF protection).

### Request body

```json
{
  "projectId": "p_01JABC123",
  "url": "https://docs.example.com",
  "name": "Acme docs"
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `projectId` | `string` | Yes | UUID of an existing project |
| `url` | `string` | Yes | Public http(s) URL |
| `name` | `string` | No | Max 160 characters; defaults to the URL's hostname |

### Success response (`202`)

The created source with `status: "PENDING"`.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid or unexpected body fields, or the URL fails the public-host/SSRF checks |
| `404` | `Project with ID <projectId> not found` |
| `503` | The knowledge indexing queue is unavailable |

## Update a knowledge source

```http
PATCH /api/admin/knowledge/sources/:id
```

Updates only the fields provided. `name` is a display-only change and never
touches persisted pages. Changing `url` re-validates the target (SSRF checks
preserved), only works for website sources, resets the source to `PENDING`,
and queues a fresh crawl + re-index so the stored pages follow the new URL.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The knowledge source's UUID |

### Request body

```json
{
  "name": "Acme docs (main)",
  "url": "https://docs.example.com/v2"
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | `string` | No | Between 1 and 160 characters |
| `url` | `string` | No | Public http(s) URL; website sources only |

At least one field must be provided. `status`, `error`, and `metadata` are
system-managed and never writable.

### Success response

The updated source. When `url` changed, `status` is `PENDING` and the response
is followed by an asynchronous recrawl.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid body fields, or `url` given for a non-website source |
| `404` | `Knowledge source with ID <id> not found` |

## Delete a knowledge source

```http
DELETE /api/admin/knowledge/sources/:id
```

Deletes the source. Its crawled pages are removed by the schema cascade
(`knowledge_page` is `onDelete: Cascade`), so no orphan rows remain. The
vector index is also removed; if the vector service is temporarily
unavailable the deletion still succeeds and the orphaned vector is never
returned because retrieval is source-id scoped.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The knowledge source's UUID |

### Success response

```json
{
  "id": "3f0c...",
  "name": "Acme docs",
  "deleted": true
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Knowledge source with ID <id> not found` |

## Refresh a knowledge source

```http
POST /api/admin/knowledge/sources/:id/refresh
```

Resets the source to `PENDING`, clears its error, and queues a fresh crawl and
re-index. Equivalent to the user-facing refresh but scoped to any source.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The knowledge source's UUID |

### Success response (`202`)

The source with `status: "PENDING"`.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Knowledge source with ID <id> not found` |
| `503` | The knowledge indexing queue is unavailable |

## List knowledge pages

```http
GET /api/admin/knowledge/pages
```

Returns a paginated list of crawled pages, suitable for an admin table. Only
the page identity and its source are returned; the page text is available on
the detail endpoint.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `search` | `string` | – | Case-insensitive match on page title or URL |
| `sourceId` | `string` | – | UUID of the parent knowledge source |
| `projectId` | `string` | – | UUID of the owning project (via the source) |
| `sortBy` | `string` | `crawledAt` | `title`, `url`, `crawledAt`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | `DESC` | `ASC` or `DESC` |

Pages have no status column — errors surface through the nullable `error`
field — so no status filter exists.

### Success response

```json
{
  "data": [
    {
      "id": "9d21...",
      "url": "https://docs.example.com/faq",
      "title": "Frequently asked questions",
      "error": null,
      "crawledAt": "2026-08-10T12:28:00.000Z",
      "createdAt": "2026-08-10T12:28:00.000Z",
      "updatedAt": "2026-08-10T12:28:00.000Z",
      "source": { "id": "3f0c...", "name": "Acme docs", "type": "WEBSITE", "status": "READY" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, `sourceId`, `projectId`, `sortBy`, or `sortOrder` |

## Get one knowledge page

```http
GET /api/admin/knowledge/pages/:id
```

Returns the full page together with its parent source and owning project.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The knowledge page's UUID |

### Success response

```json
{
  "id": "9d21...",
  "url": "https://docs.example.com/faq",
  "title": "Frequently asked questions",
  "content": "How can I...",
  "contentHash": "5e8848...",
  "error": null,
  "crawledAt": "2026-08-10T12:28:00.000Z",
  "createdAt": "2026-08-10T12:28:00.000Z",
  "updatedAt": "2026-08-10T12:28:00.000Z",
  "source": { "id": "3f0c...", "name": "Acme docs", "type": "WEBSITE", "status": "READY", "url": "https://docs.example.com" },
  "project": { "id": "p_01JABC123", "name": "Acme launch" }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Knowledge page with ID <id> not found` |

## Notes

- There are no admin create/update/delete operations for **pages**: pages are
  derived data generated by the crawler during indexing. They are
  inspected through the list/detail endpoints and managed indirectly through
  their source (refresh re-crawls them, delete removes them by cascade).
  Exposing direct page mutation would fight the crawler's ownership of that
  data.
- The legacy untyped `GET /api/admin/knowledge-sources` and
  `GET /api/admin/knowledge-sources/:id` handlers in the base admin controller
  remain for backwards compatibility; this module's typed
  `/api/admin/knowledge/*` endpoints are the recommended replacement.

## Campaign management

Admin endpoints to inspect and safely manage campaigns and their relations.
The module lives under `/api/admin/campaigns` and reuses the existing campaign
service rules (field validation, date-range checks, and the published-campaign
invariant), so admin operations never bypass the workflow rules the
application enforces for owners.

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/campaigns` | List campaigns with search, filters, sorting, pagination |
| `GET` | `/api/admin/campaigns/:id` | Get one campaign with owner and relation summaries |
| `PATCH` | `/api/admin/campaigns/:id` | Update a campaign's editable fields |
| `DELETE` | `/api/admin/campaigns/:id` | Delete a campaign (cascades its relations) |
| `POST` | `/api/admin/campaigns/:id/publish` | Publish a draft campaign |
| `POST` | `/api/admin/campaigns/:id/unpublish` | Take a published campaign offline |
| `GET` | `/api/admin/campaigns/:id/contents` | List generated content (paginated) |
| `GET` | `/api/admin/campaigns/:id/publications` | List social publications (paginated) |
| `GET` | `/api/admin/campaigns/:id/strategies` | List strategy workflow runs (paginated) |
| `GET` | `/api/admin/campaigns/:id/content-runs` | List content workflow runs (paginated) |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

### Response conventions

Paginated list responses use the shared shape:

```json
{
  "data": [ { "id": "3f0c...", "name": "Acme launch" } ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Campaign responses never expose credentials, tokens, or internal workflow
input/output payloads; the workflow runs only surface their stable identifiers
and statuses.

## List campaigns

```http
GET /api/admin/campaigns
```

Returns a paginated list of campaigns. Every option is optional; an empty
query returns the newest campaigns first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `search` | `string` | – | Case-insensitive match on name, description, objective, or project name |
| `status` | `string` | – | `DRAFT` or `PUBLISHED` |
| `projectId` | `string` | – | UUID of the owning project |
| `from` | `string` | – | ISO date; campaigns created on/after this date |
| `to` | `string` | – | ISO date; campaigns created on/before this date |
| `sortBy` | `string` | `createdAt` | `name`, `status`, `createdAt`, `updatedAt`, `startDate`, `endDate`, `publishedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`; when
`sortBy` is given without `sortOrder`, ordering is `ASC`.

### Success response

```json
{
  "data": [
    {
      "id": "3f0c...",
      "name": "Acme launch",
      "description": null,
      "status": "DRAFT",
      "startDate": null,
      "endDate": null,
      "publishedAt": null,
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-10T12:30:00.000Z",
      "project": { "id": "p_01JABC123", "name": "Acme launch" },
      "contentCount": 18,
      "strategyCount": 3,
      "contentRunCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`contentCount`, `strategyCount`, and `contentRunCount` are aggregate counts
over the campaign's relations.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, `status`, `projectId`, `sortBy`, `sortOrder`, or `from` later than `to` |

## Get one campaign

```http
GET /api/admin/campaigns/:id
```

Returns the campaign together with its project owner and aggregate counts for
the relations hanging off it. The summaries are computed with separate `count`
queries, so large campaigns never produce huge nested responses.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The campaign's UUID |

### Success response

```json
{
  "id": "3f0c...",
  "name": "Acme launch",
  "description": "Q3 go-to-market",
  "objective": "Increase signups",
  "audience": "SMB founders",
  "tone": "Confident",
  "channels": ["instagram", "email"],
  "status": "DRAFT",
  "startDate": null,
  "endDate": null,
  "publishedAt": null,
  "createdAt": "2026-08-01T09:00:00.000Z",
  "updatedAt": "2026-08-10T12:30:00.000Z",
  "project": {
    "id": "p_01JABC123",
    "name": "Acme launch",
    "owner": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" }
  },
  "summary": {
    "contents": 18,
    "strategies": 3,
    "contentRuns": 2,
    "publications": 4,
    "workflowExecutions": 12
  }
}
```

The `summary` counts are:

| Field | Meaning |
| --- | --- |
| `contents` | Generated content rows owned by the campaign |
| `strategies` | Strategy workflow runs under the campaign |
| `contentRuns` | Content workflow runs under the campaign |
| `publications` | Social publications derived from the campaign's content |
| `workflowExecutions` | Accounting rows for every strategy/content run under the campaign |

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Campaign with ID <id> not found` |

## Update a campaign

```http
PATCH /api/admin/campaigns/:id
```

Updates only the fields provided, using the same validation rules as the
user-facing update. `status` and `publishedAt` are never writable here —
transitions go through the dedicated publish/unpublish endpoints.

Editing a **published** campaign forces it back to `DRAFT` and clears
`publishedAt`, preserving the invariant that `publishedAt` always points at
the exact published version (the same rule the user-facing save-draft flow
enforces). An empty body on a published campaign is rejected so an empty
request can never silently take a live campaign offline.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The campaign's UUID |

### Request body

```json
{
  "name": "Acme launch revamped",
  "description": "Updated Q3 go-to-market",
  "channels": ["instagram", "email", "tiktok"]
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | `string` | No | Between 1 and 120 characters |
| `description` | `string` | No | Max 2000 characters |
| `objective` | `string` | No | Max 1000 characters |
| `audience` | `string` | No | Max 500 characters |
| `tone` | `string` | No | Max 120 characters |
| `channels` | `string[]` | No | Up to 20 strings, max 60 characters each |
| `startDate` | `string` | No | ISO 8601 date; `endDate` must not precede it |
| `endDate` | `string` | No | ISO 8601 date |

### Success response

The updated [campaign](#get-one-campaign) core fields (without owner/summary).
When the campaign was published, `status` is `DRAFT` and `publishedAt` is
`null`.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid or unexpected body fields, an invalid date range, or an empty body on a published campaign |
| `404` | `Campaign with ID <id> not found` |

## Delete a campaign

```http
DELETE /api/admin/campaigns/:id
```

Deletes the campaign. The schema cascade removes its strategies, content runs,
and generated content — and, through them, workflow executions and social
publications — so no orphan rows are left behind. Only the campaign's own data
is removed; the owning project and other campaigns are untouched.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The campaign's UUID |

### Success response

```json
{
  "id": "3f0c...",
  "name": "Acme launch",
  "deleted": true
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Campaign with ID <id> not found` |

## Publish a campaign

```http
POST /api/admin/campaigns/:id/publish
```

Publishes a draft campaign, setting `publishedAt`. Publishing an already
published campaign returns `409`.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The campaign's UUID |

### Success response

The campaign with `status: "PUBLISHED"` and `publishedAt` set.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Campaign with ID <id> not found` |
| `409` | `Campaign is already published` |

## Unpublish a campaign

```http
POST /api/admin/campaigns/:id/unpublish
```

Takes a published campaign offline without touching its content: status
returns to `DRAFT` and `publishedAt` is cleared. Un-publishing a draft returns
`409`.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The campaign's UUID |

### Success response

The campaign with `status: "DRAFT"` and `publishedAt` `null`.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Campaign with ID <id> not found` |
| `409` | `Campaign is not published` |

## List campaign contents

```http
GET /api/admin/campaigns/:id/contents
```

Paginated list of generated content under the campaign, suitable for an admin
table. Content bodies/payloads are intentionally not returned.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `PENDING`, `READY`, or `FAILED` |
| `format` | `string` | – | `TEXT`, `MARKDOWN`, `HTML`, or `JSON` |
| `type` | `string` | – | Case-insensitive partial match on the content type |

### Success response

```json
{
  "data": [
    {
      "id": "c01JABC123",
      "type": "instagram_post",
      "title": "Launch teaser",
      "format": "MARKDOWN",
      "status": "READY",
      "version": 1,
      "isEdited": false,
      "error": null,
      "contentRunId": null,
      "createdAt": "2026-08-10T12:30:00.000Z",
      "updatedAt": "2026-08-10T12:30:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID, or invalid `page`, `limit`, `status`, `format`, `type` |
| `404` | `Campaign with ID <id> not found` |

## List campaign publications

```http
GET /api/admin/campaigns/:id/publications
```

Paginated list of social publications derived from the campaign's content.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `QUEUED`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, or `CANCELLED` |
| `platform` | `string` | – | `FACEBOOK` or `INSTAGRAM` |

### Success response

```json
{
  "data": [
    {
      "id": "pub_01JABC123",
      "status": "PUBLISHED",
      "platform": "INSTAGRAM",
      "accountName": "Acme",
      "caption": "Launch day is here",
      "scheduledFor": "2026-08-11T09:00:00.000Z",
      "publishedAt": "2026-08-11T09:00:00.000Z",
      "externalPostId": "1789...",
      "error": null,
      "revision": 1,
      "createdAt": "2026-08-10T12:30:00.000Z",
      "updatedAt": "2026-08-11T09:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID, or invalid `page`, `limit`, `status`, `platform` |
| `404` | `Campaign with ID <id> not found` |

## Campaign workflow traceability

The following read-only endpoints expose the workflow runs attached to a
campaign so the admin can navigate from a campaign to its workflow runs (and
later, in the workflow observability phase, to per-agent execution details).
Each row carries the durable Mastra run id and its workflow status. No agent
usage/cost data is returned here.

### List strategy workflow runs

```http
GET /api/admin/campaigns/:id/strategies
```

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `PENDING`, `RUNNING`, `SUSPENDED`, `CANCELED`, `READY`, or `FAILED` |
| `approvalStatus` | `string` | – | `PENDING_REVIEW`, `CHANGES_REQUESTED`, or `APPROVED` |

```json
{
  "data": [
    {
      "id": "s01JABC123",
      "runId": "0f4c...",
      "status": "READY",
      "approvalStatus": "APPROVED",
      "error": null,
      "reviewedAt": "2026-08-10T14:00:00.000Z",
      "createdAt": "2026-08-10T12:00:00.000Z",
      "updatedAt": "2026-08-10T14:00:00.000Z",
      "executionCount": 1
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`runId` is Mastra's workflow run identifier; `executionCount` is the number of
accounting rows recorded for the run.

### List content workflow runs

```http
GET /api/admin/campaigns/:id/content-runs
```

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `PENDING`, `RUNNING`, `SUSPENDED`, `CANCELED`, `READY`, or `FAILED` |

```json
{
  "data": [
    {
      "id": "cr01JABC123",
      "runId": "7a2e...",
      "status": "READY",
      "contentCount": 6,
      "error": null,
      "createdAt": "2026-08-10T15:00:00.000Z",
      "updatedAt": "2026-08-10T15:30:00.000Z",
      "executionCount": 1
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`runId` is Mastra's workflow run identifier; `contentCount` is the number of
`GeneratedContent` rows fanned out from the run.

### Possible errors (both endpoints)

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID, or invalid query parameters |
| `404` | `Campaign with ID <id> not found` |

## Notes

- There is no admin **create** endpoint: campaigns are created by their owner
  through the project-scoped flow, which keeps the initial campaign lifecycle
  consistent.
- The previous untyped `GET /api/admin/campaigns` and
  `GET /api/admin/campaigns/:id` handlers in the base admin controller were
  replaced by this typed module.

## Workflow execution management & accounting

Admin endpoints to inspect workflow executions, their per-model (agent)
usage, and aggregate statistics. The module lives under `/api/admin/workflows`
and only reads what the existing workflow-accounting pipeline already
persists — it never calls the agent server on its own, so it never triggers or
resumes runs.

Each workflow execution is one `WorkflowExecution` accounting row for a Mastra
run. Every run belongs to one of the two AI workflows plus the strategy-section
revision workflow:

| `kind` | Workflow |
| --- | --- |
| `STRATEGY` | Marketing Strategy workflow |
| `STRATEGY_SECTION_REVISION` | Strategy section revision |
| `CONTENT` | Content Creation workflow |

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/workflows/executions` | List executions with filters, sorting, pagination |
| `GET` | `/api/admin/workflows/executions/:id` | One execution with refs, persisted input/output, and accounting |
| `GET` | `/api/admin/workflows/executions/:id/agents` | Per-model usage entries for one execution |
| `GET` | `/api/admin/workflows/statistics` | Aggregate workflow statistics |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

### Cost semantics

Cost is collected by the existing workflow-accounting pipeline from Mastra's
usage exporter and stored on the execution row. `estimatedCostUsd` is only
populated when `accountingStatus` is `READY` and `costUnit` is `USD`;
otherwise it is `null`. Pending, unpriced, or unavailable accounting is never
given a fabricated cost. `modelBreakdown` holds the per-model usage that the
pipeline captured — there is no persisted per-agent step input/output, so
agent rows expose tokens and cost but not step payloads.

## List workflow executions

```http
GET /api/admin/workflows/executions
```

Returns a paginated list of workflow executions. Every option is optional; an
empty query returns the newest executions first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `kind` | `string` | – | `STRATEGY`, `STRATEGY_SECTION_REVISION`, or `CONTENT` |
| `status` | `string` | – | `PENDING`, `RUNNING`, `SUSPENDED`, `CANCELED`, `READY`, or `FAILED` |
| `accountingStatus` | `string` | – | `PENDING`, `READY`, `UNPRICED`, or `UNAVAILABLE` |
| `userId` | `string` | – | UUID of the owning user |
| `projectId` | `string` | – | UUID of the owning project |
| `campaignId` | `string` | – | UUID of the owning campaign |
| `from` | `string` | – | ISO date; executions created on/after this date |
| `to` | `string` | – | ISO date; executions created on/before this date |
| `search` | `string` | – | Case-insensitive partial match on the Mastra run id |
| `sortBy` | `string` | `createdAt` | `kind`, `status`, `totalTokens`, `estimatedCost`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`; when
`sortBy` is given without `sortOrder`, ordering is `ASC`. User/project/campaign
filters are combined with AND and resolve through the execution's strategy or
content run.

### Success response

```json
{
  "data": [
    {
      "id": "3f0c...",
      "mastraRunId": "0f4c...",
      "workflowId": "marketingStrategyWorkflow",
      "kind": "STRATEGY",
      "status": "READY",
      "accountingStatus": "READY",
      "inputTokens": 1200,
      "outputTokens": 3400,
      "totalTokens": 4600,
      "estimatedCostUsd": 0.012345,
      "costUnit": "USD",
      "agentCount": 3,
      "startedAt": "2026-08-10T12:00:00.000Z",
      "finishedAt": "2026-08-10T12:04:30.000Z",
      "durationMs": 270000,
      "createdAt": "2026-08-10T11:59:50.000Z",
      "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
      "project": { "id": "p_01JABC123", "name": "Acme launch" },
      "campaign": { "id": "c01JABC123", "name": "Acme launch" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`user`, `project`, and `campaign` are `null` when the linked strategy/content
run is missing.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, filter values, `sortBy`, `sortOrder`, or `from` later than `to` |

## Get one workflow execution

```http
GET /api/admin/workflows/executions/:id
```

Returns a detailed view of one execution. Workflow-level fields (metadata,
refs, timestamps, accounting totals, persisted input/output) are distinct from
the `agents` array, which holds the per-model usage entries.

Before responding, the endpoint runs the accounting service's read-repair so a
briefly stale usage exporter is refreshed rather than served as permanently
unavailable.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The workflow execution's UUID |

### Success response

```json
{
  "id": "3f0c...",
  "mastraRunId": "0f4c...",
  "workflowId": "marketingStrategyWorkflow",
  "kind": "STRATEGY",
  "status": "READY",
  "accountingStatus": "READY",
  "inputTokens": 1200,
  "outputTokens": 3400,
  "totalTokens": 4600,
  "estimatedCostUsd": 0.012345,
  "costUnit": "USD",
  "agentCount": 3,
  "startedAt": "2026-08-10T12:00:00.000Z",
  "finishedAt": "2026-08-10T12:04:30.000Z",
  "durationMs": 270000,
  "createdAt": "2026-08-10T11:59:50.000Z",
  "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
  "project": { "id": "p_01JABC123", "name": "Acme launch" },
  "campaign": { "id": "c01JABC123", "name": "Acme launch" },
  "strategyId": "s01JABC123",
  "contentRunId": null,
  "workflowInput": { "brand": "Acme", "goal": "Q3 launch" },
  "workflowOutput": { "campaignStrategy": { "summary": "..." } },
  "suspendPayload": null,
  "usageCollectedAt": "2026-08-10T12:05:00.000Z",
  "updatedAt": "2026-08-10T12:05:00.000Z",
  "agents": [
    {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "inputTokens": 600,
      "outputTokens": 1100,
      "totalTokens": 1700,
      "estimatedCostUsd": 0.004200,
      "costUnit": "USD"
    }
  ]
}
```

`workflowInput`/`workflowOutput`/`suspendPayload` are the persisted JSON from
the parent strategy or content run, `null` when that parent is missing. `agents`
is empty when accounting has not been collected yet.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Workflow execution with ID <id> not found` |

## Get one execution's agents

```http
GET /api/admin/workflows/executions/:id/agents
```

Returns the per-model usage entries persisted for the execution, in the order
Mastra's exporter produced them. Only tokens and cost are persisted at this
granularity; per-agent step input/output is not stored, so it is not returned
(use the execution detail for the workflow-level input/output).

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The workflow execution's UUID |

### Success response

```json
{
  "data": [
    {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "inputTokens": 600,
      "outputTokens": 1100,
      "totalTokens": 1700,
      "estimatedCostUsd": 0.004200,
      "costUnit": "USD"
    }
  ],
  "meta": { "total": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Workflow execution with ID <id> not found` |

## Workflow statistics

```http
GET /api/admin/workflows/statistics
```

Aggregate statistics computed from the persisted execution rows via Prisma
`count`, `groupBy`, and `aggregate` queries.

### Success response

```json
{
  "totalExecutions": 42,
  "byWorkflow": [
    { "workflowId": "marketingStrategyWorkflow", "count": 18 },
    { "workflowId": "contentCreationWorkflow", "count": 24 }
  ],
  "byKind": [ { "kind": "STRATEGY", "count": 18 }, { "kind": "CONTENT", "count": 24 } ],
  "byStatus": [ { "status": "READY", "count": 38 }, { "status": "FAILED", "count": 4 } ],
  "successful": 38,
  "failed": 4,
  "canceled": 0,
  "pending": 0,
  "totalTokens": 210000,
  "totalCostUsd": 0.581234,
  "averageDurationMs": 285000,
  "averageCostUsd": 0.013839,
  "costByWorkflow": [
    { "workflowId": "marketingStrategyWorkflow", "estimatedCostUsd": 0.312000 }
  ],
  "byModel": [
    {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "executionCount": 30,
      "totalTokens": 96000,
      "estimatedCostUsd": 0.201000
    }
  ]
}
```

`totalCostUsd` sums the priced (READY + USD) execution costs; unpriced rows
contribute nothing and, when no cost is priced at all, it is `null`.
`averageCostUsd` is `totalCostUsd / totalExecutions`. `averageDurationMs` is
the mean wall-clock time over executions with both timestamps.
`byModel` aggregates the persisted per-model breakdown across executions;
`estimatedCostUsd` is `null` when none of its executions were priced.

### Possible errors

| Status | Situation |
| --- | --- |
| none | The endpoint is read-only over persisted data |

## Notes

- The previous untyped `GET /api/admin/workflow-executions` and
  `GET /api/admin/workflow-executions/:id` handlers in the base admin controller
  remain for backwards compatibility; this module's typed
  `/api/admin/workflows/*` endpoints are the recommended replacement.
- Per-agent **step** input/output and per-agent status/timing are not persisted
  anywhere in the current schema — only workflow-level input/output and
  per-model usage are. This phase exposes exactly what is stored and does not
  invent the rest; the future observability phase can enrich the pipeline
  without changing this API's contract.

## Social publications management

Admin endpoints to inspect and safely manage social publication records. The
module lives under `/api/admin/social/publications` and reuses the existing
publication service rules, so admin operations never bypass the publishing
lifecycle the application enforces for owners.

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/social/publications` | List publications with filters, sorting, pagination |
| `GET` | `/api/admin/social/publications/:id` | One publication with content/campaign/project/account refs |
| `PATCH` | `/api/admin/social/publications/:id` | Edit the caption of a pre-publish or failed publication |
| `DELETE` | `/api/admin/social/publications/:id` | Cancel a queued/scheduled publication |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

### Lifecycle and deletion semantics

A publication moves through `QUEUED`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`,
`FAILED`, or `CANCELLED`. The domain model has **no hard delete**: the
user-facing `DELETE` cancels a queued/scheduled publication (a revision bump
invalidates the queued BullMQ job so it never fires). The admin `DELETE`
follows the same rule — hard-deleting a record would leave its queued job or an
already-live external post orphaned, so it is intentionally not offered.

Only safe publication data is ever returned. Social account and connection
responses include id, platform, names, and statuses but **never** access
tokens, refresh tokens, ciphertext, or OAuth secrets.

## List social publications

```http
GET /api/admin/social/publications
```

Returns a paginated list of publications. Every option is optional; an empty
query returns the newest publications first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `QUEUED`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `FAILED`, or `CANCELLED` |
| `platform` | `string` | – | `FACEBOOK` or `INSTAGRAM` |
| `socialAccountId` | `string` | – | UUID of the linked social account |
| `campaignId` | `string` | – | UUID of the owning campaign (via the content) |
| `projectId` | `string` | – | UUID of the owning project (via the content) |
| `from` | `string` | – | ISO date; publications created on/after this date |
| `to` | `string` | – | ISO date; publications created on/before this date |
| `search` | `string` | – | Case-insensitive match on account name or content title |
| `sortBy` | `string` | `createdAt` | `status`, `platform`, `scheduledFor`, `publishedAt`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`; when
`sortBy` is given without `sortOrder`, ordering is `ASC`. Project/campaign
filters are combined with AND.

### Success response

```json
{
  "data": [
    {
      "id": "pub_01JABC123",
      "status": "SCHEDULED",
      "scheduledFor": "2026-08-11T09:00:00.000Z",
      "caption": "Launch day is here",
      "platform": "INSTAGRAM",
      "accountName": "Acme",
      "externalAccountId": "1789...",
      "publishedAt": null,
      "externalPostId": null,
      "error": null,
      "revision": 1,
      "createdAt": "2026-08-10T12:30:00.000Z",
      "updatedAt": "2026-08-10T12:30:00.000Z",
      "content": { "id": "c01JABC123", "title": "Launch teaser" },
      "campaign": { "id": "cam01JABC123", "name": "Acme launch" },
      "project": { "id": "p_01JABC123", "name": "Acme launch" },
      "socialAccount": {
        "id": "acc01JABC123",
        "platform": "INSTAGRAM",
        "name": "Acme",
        "username": "acme",
        "imageUrl": null,
        "externalId": "1789...",
        "selected": true,
        "available": true,
        "connection": {
          "id": "con01JABC123",
          "provider": "META",
          "status": "ACTIVE",
          "lastSyncedAt": "2026-08-10T12:00:00.000Z",
          "lastError": null
        }
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`content`/`campaign`/`project`/`socialAccount` are `null` when the linked
record is missing.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, filter values, `sortBy`, `sortOrder`, or `from` later than `to` |

## Get one social publication

```http
GET /api/admin/social/publications/:id
```

Returns a full view of one publication: scheduling, publishing result/error,
and the related content, campaign, project (with owner), and social account.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The social publication's UUID |

### Success response

```json
{
  "id": "pub_01JABC123",
  "status": "PUBLISHED",
  "scheduledFor": "2026-08-11T09:00:00.000Z",
  "caption": "Launch day is here",
  "mediaUrl": null,
  "platform": "INSTAGRAM",
  "accountName": "Acme",
  "externalAccountId": "1789...",
  "publishedAt": "2026-08-11T09:00:00.000Z",
  "externalPostId": "1789post...",
  "error": null,
  "revision": 1,
  "createdAt": "2026-08-10T12:30:00.000Z",
  "updatedAt": "2026-08-11T09:00:00.000Z",
  "content": { "id": "c01JABC123", "title": "Launch teaser", "type": "instagram_post", "format": "MARKDOWN", "status": "READY" },
  "campaign": { "id": "cam01JABC123", "name": "Acme launch" },
  "project": { "id": "p_01JABC123", "name": "Acme launch", "owner": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" } },
  "socialAccount": {
    "id": "acc01JABC123",
    "platform": "INSTAGRAM",
    "name": "Acme",
    "username": "acme",
    "imageUrl": null,
    "externalId": "1789...",
    "selected": true,
    "available": true,
    "connection": { "id": "con01JABC123", "provider": "META", "status": "ACTIVE", "lastSyncedAt": "2026-08-10T12:00:00.000Z", "lastError": null }
  }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Social publication with ID <id> not found` |

## Update a social publication

```http
PATCH /api/admin/social/publications/:id
```

Edits the caption. Only `QUEUED`, `SCHEDULED`, and `FAILED` publications can be
edited: the queue worker reads the caption from the row when the job fires, so
an edit before publishing is picked up, while published, in-flight, or
cancelled records are immutable. No other field is writable — status,
scheduling, platform, external ids, and the revision are system-managed.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The social publication's UUID |

### Request body

```json
{
  "caption": "Launch day is here — updated copy"
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `caption` | `string` | Yes | Between 1 and 2200 characters (after trimming) |

### Success response

The updated publication (same shape as the detail response).

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid body, caption empty after trimming, or `id` not a valid UUID |
| `404` | `Social publication with ID <id> not found` |
| `409` | The publication is not in an editable state (e.g. already published) |

## Delete a social publication

```http
DELETE /api/admin/social/publications/:id
```

Cancels the publication, following the domain's safe lifecycle: only
`QUEUED`/`SCHEDULED` publications can be cancelled, and the revision is bumped
so any queued BullMQ job is invalidated and never publishes. Already
published, in-flight, failed, or cancelled records return `409`. Records are
never hard-deleted.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The social publication's UUID |

### Success response

```json
{
  "id": "pub_01JABC123",
  "status": "CANCELLED",
  "cancelled": true
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Social publication with ID <id> not found` |
| `409` | The publication cannot be cancelled in its current state |

## Notes

- The existing untyped `GET /api/admin/publications` and
  `GET /api/admin/publications/:id` handlers in the base admin controller remain
  for backwards compatibility; this module's typed
  `/api/admin/social/publications/*` endpoints are the recommended replacement.
- Retrying a failed publication remains a user-facing action
  (`POST /publications/:id/retry`); it is deliberately not re-exposed as an
  admin-only operation because the domain flow is already owner-scoped.

## Billing & subscriptions administration

Admin endpoints to inspect subscriptions, plans, plan-change quotes, the
Stripe webhook audit trail, and generation credit events. The module lives
under `/api/admin/billing` and is **read-only**: billing mutations (checkout,
plan changes, cancellation) are Stripe-driven and owner-scoped, so the admin
layer never writes billing state or calls Stripe.

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/billing/overview` | Aggregate billing statistics and revenue |
| `GET` | `/api/admin/billing/subscriptions` | List subscriptions with filters, sorting, pagination |
| `GET` | `/api/admin/billing/subscriptions/:id` | Subscription detail + user/plan + quote/event counts |
| `GET` | `/api/admin/billing/plans` | List plans (active filter, sorting, pagination) |
| `GET` | `/api/admin/billing/plans/:id` | Plan detail + subscriber count |
| `GET` | `/api/admin/billing/quotes` | List plan-change quotes with filters, sorting, pagination |
| `GET` | `/api/admin/billing/quotes/:id` | Quote detail + user + plan + subscription |
| `GET` | `/api/admin/billing/events` | List Stripe webhook events (audit trail) |
| `GET` | `/api/admin/billing/events/:id` | Event detail with sanitized raw payload |
| `GET` | `/api/admin/billing/credit-events` | List generation credit events |
| `GET` | `/api/admin/billing/credit-events/:id` | Credit event detail + user |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

### Response conventions

Paginated list responses use the shared shape:

```json
{
  "data": [ { "id": "3f0c...", "status": "ACTIVE" } ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Only identifiers and display data are returned. Stripe API keys are never
exposed, and the raw webhook payload on the event detail is recursively
stripped of payment credentials (`client_secret`, `idempotency_key`,
`api_key`, `secret`) before it is served.

## Billing overview

```http
GET /api/admin/billing/overview
```

Aggregate statistics computed with Prisma `count`, `groupBy`, and `aggregate`
queries.

### Success response

```json
{
  "totalPlans": 4,
  "activePlans": 3,
  "totalSubscriptions": 42,
  "byStatus": [ { "status": "ACTIVE", "count": 30 } ],
  "byPlan": [ { "planCode": "pro-monthly", "count": 20 } ],
  "active": 30,
  "trialing": 2,
  "pastDue": 1,
  "canceled": 4,
  "pendingChangeCount": 3,
  "totalRevenueCents": 54900,
  "chargedPlanChanges": 12,
  "totalCreditEvents": 180,
  "refundedCreditEvents": 6
}
```

`totalRevenueCents` is the sum of consumed plan-change quotes — the money that
actually moved through the application (initial Stripe charges are settled by
Stripe and not recorded as monetary rows, mirroring the dashboard overview).

## List subscriptions

```http
GET /api/admin/billing/subscriptions
```

Every option is optional; an empty query returns the newest subscriptions
first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `INCOMPLETE`, `INCOMPLETE_EXPIRED`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `PAUSED`, `UNPAID`, or `CANCELLED` |
| `planId` | `string` | – | UUID of the subscribed plan |
| `userId` | `string` | – | UUID of the owning user |
| `search` | `string` | – | Case-insensitive match on user name or email |
| `from` | `string` | – | ISO date; subscriptions created on/after this date |
| `to` | `string` | – | ISO date; subscriptions created on/before this date |
| `sortBy` | `string` | `createdAt` | `status`, `planId`, `currentPeriodEnd`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`; when
`sortBy` is given without `sortOrder`, ordering is `ASC`.

### Success response

```json
{
  "data": [
    {
      "id": "sub_01JABC123",
      "userId": "usr_01JABC123",
      "status": "ACTIVE",
      "planId": "pl_01JABC123",
      "billingInterval": "MONTHLY",
      "currentPeriodStart": "2026-08-01T00:00:00.000Z",
      "currentPeriodEnd": "2026-08-31T23:59:59.000Z",
      "cancelAtPeriodEnd": false,
      "canceledAt": null,
      "pendingPlanId": null,
      "pendingInterval": null,
      "pendingEffectiveAt": null,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-10T12:30:00.000Z",
      "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
      "plan": { "id": "pl_01JABC123", "code": "pro-monthly", "name": "Pro Monthly" },
      "pendingPlan": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, `status`, `planId`, `userId`, `sortBy`, `sortOrder`, or `from` later than `to` |

## Get one subscription

```http
GET /api/admin/billing/subscriptions/:id
```

Returns the subscription with its user, plan, pending plan, Stripe
identifiers, and aggregate quote/event counts.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The subscription's UUID |

### Success response

The list shape plus:

```json
{
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_...",
  "stripePriceId": "price_...",
  "checkoutSessionId": "cs_...",
  "stripeScheduleId": null,
  "quoteCount": 2,
  "eventCount": 14
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Subscription with ID <id> not found` |

## List plans

```http
GET /api/admin/billing/plans
```

Plans are a small static set; pagination is still applied for consistency.
Empty query returns plans in `sortOrder` ascending.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `active` | `string` | – | `true` or `false` |
| `sortBy` | `string` | `sortOrder` | `sortOrder`, `name`, `priceMonthlyCents`, `generationCredits`, `createdAt` |
| `sortOrder` | `string` | `ASC` | `ASC` or `DESC` |

### Success response

```json
{
  "data": [
    {
      "id": "pl_01JABC123",
      "code": "pro-monthly",
      "name": "Pro Monthly",
      "description": null,
      "sortOrder": 10,
      "active": true,
      "stripeProductId": "prod_...",
      "priceMonthlyCents": 2900,
      "priceYearlyCents": 29000,
      "generationCredits": 50,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "subscriberCount": 20
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 4, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid `page`, `limit`, `active`, `sortBy`, or `sortOrder` |

## Get one plan

```http
GET /api/admin/billing/plans/:id
```

Returns the plan with its subscriber count.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The plan's UUID |

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Plan with ID <id> not found` |

## List plan change quotes

```http
GET /api/admin/billing/quotes
```

Plan-change quotes are the durable record of every priced plan switch —
`consumedAt` marks the quote that was actually charged.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `userId` | `string` | – | UUID of the user the quote was priced for |
| `planId` | `string` | – | UUID of the target plan |
| `kind` | `string` | – | `UPGRADE` or `DOWNGRADE` |
| `consumed` | `string` | – | `true` or `false` |
| `from` | `string` | – | ISO date; quotes created on/after this date |
| `to` | `string` | – | ISO date; quotes created on/before this date |
| `sortBy` | `string` | `createdAt` | `kind`, `amountDueCents`, `effectiveAt`, `expiresAt`, `consumedAt`, `createdAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`; when
`sortBy` is given without `sortOrder`, ordering is `ASC`.

### Success response

```json
{
  "data": [
    {
      "id": "q_01JABC123",
      "subscriptionId": "sub_01JABC123",
      "userId": "usr_01JABC123",
      "kind": "UPGRADE",
      "planId": "pl_01JABC123",
      "interval": "MONTHLY",
      "amountDueCents": 1200,
      "currency": "usd",
      "unusedCreditCents": 800,
      "newPlanChargeCents": 2000,
      "effectiveAt": null,
      "expiresAt": "2026-08-10T12:45:00.000Z",
      "consumedAt": "2026-08-10T12:31:00.000Z",
      "createdAt": "2026-08-10T12:30:00.000Z",
      "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
      "plan": { "id": "pl_01JABC123", "code": "pro-monthly", "name": "Pro Monthly" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid query parameters, or `from` later than `to` |

## Get one plan change quote

```http
GET /api/admin/billing/quotes/:id
```

Returns the quote with its user, target plan, and the subscription it was
created against.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The quote's UUID |

### Success response

The list shape plus `fromPriceId`, `targetPriceId`, the credit projection
(`creditsLimit`, `creditsUsed`, `creditsNewLimit`), and `subscription`.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Plan change quote with ID <id> not found` |

## List subscription events

```http
GET /api/admin/billing/events
```

The Stripe webhook audit trail. Each row is one processed webhook event.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `type` | `string` | – | Case-insensitive partial match on the Stripe event type |
| `subscriptionId` | `string` | – | UUID of the affected subscription |
| `from` | `string` | – | ISO date; events processed on/after this date |
| `to` | `string` | – | ISO date; events processed on/before this date |
| `sortBy` | `string` | `processedAt` | `type`, `processedAt`, `createdAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `processedAt DESC`.

### Success response

```json
{
  "data": [
    {
      "id": "e_01JABC123",
      "stripeEventId": "evt_...",
      "type": "checkout.session.completed",
      "subscriptionId": "sub_01JABC123",
      "processedAt": "2026-08-10T12:31:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid query parameters, or `from` later than `to` |

## Get one subscription event

```http
GET /api/admin/billing/events/:id
```

Returns the event with its raw stored Stripe payload, **sanitized**: the
payload is recursively stripped of payment credentials (`client_secret`,
`idempotency_key`, `api_key`, `secret`) before being served.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The event's UUID |

### Success response

The list shape plus `payload` and `subscription` (`{ id, status, plan }`).

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Subscription event with ID <id> not found` |

## List generation credit events

```http
GET /api/admin/billing/credit-events
```

One immutable row per generation request (with its idempotent reference), plus
`refundedAt` for runs that failed or were cancelled before producing output.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `userId` | `string` | – | UUID of the owning user |
| `kind` | `string` | – | `STRATEGY`, `STRATEGY_SECTION_REVISION`, `CONTENT_WORKFLOW`, or `CONTENT_ITEM` |
| `refunded` | `string` | – | `true` or `false` |
| `from` | `string` | – | ISO date; events created on/after this date |
| `to` | `string` | – | ISO date; events created on/before this date |
| `sortBy` | `string` | `createdAt` | `kind`, `amount`, `periodStart`, `createdAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`.

### Success response

```json
{
  "data": [
    {
      "id": "ce_01JABC123",
      "userId": "usr_01JABC123",
      "referenceId": "strategy:0f4c...",
      "kind": "STRATEGY",
      "amount": 1,
      "periodStart": "2026-08-01T00:00:00.000Z",
      "refundedAt": null,
      "createdAt": "2026-08-10T12:00:00.000Z",
      "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid query parameters, or `from` later than `to` |

## Get one generation credit event

```http
GET /api/admin/billing/credit-events/:id
```

Returns the event with its user.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The credit event's UUID |

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Generation credit event with ID <id> not found` |

## Notes

- This module is **read-only by design**. Checkout, plan changes, and
  cancellation are Stripe-driven and owner-scoped; applying them directly as an
  admin would bypass Stripe's authoritative state and risk double-billing.
- Stripe API keys, customer payment credentials, and the account's
  `accessTokenCiphertext`-style secrets are never returned.
- The existing untyped `/api/admin/plans`, `/api/admin/subscriptions`,
  `/api/admin/dashboard/revenue*`, and `/api/admin/credit-events` handlers in
  the base admin controller remain for backwards compatibility; this module's
  typed `/api/admin/billing/*` endpoints are the recommended replacement.

## Strategy administration

Admin endpoints to inspect marketing-strategy workflow runs. The module lives
under `/api/admin/strategies` and is **read-only**: starting, reviewing,
resuming, and regenerating strategies are owner-scoped, queue-backed domain
operations, so the admin layer only observes persisted strategy data.

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/strategies` | List strategies with filters, sorting, pagination |
| `GET` | `/api/admin/strategies/:id` | Strategy detail + persisted workflow input/output + review summary |
| `GET` | `/api/admin/strategies/:id/reviews` | Immutable review trail for one strategy |

## Authentication

Protected by `AdminGuard`, same rules as every other admin endpoint: a valid
session for a user whose `role` is `ADMIN`. `401` without a session, `403` for
non-admin sessions.

## List strategies

```http
GET /api/admin/strategies
```

Every option is optional; an empty query returns the newest strategies first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `PENDING`, `RUNNING`, `SUSPENDED`, `CANCELED`, `READY`, or `FAILED` |
| `approvalStatus` | `string` | – | `PENDING_REVIEW`, `CHANGES_REQUESTED`, or `APPROVED` |
| `campaignId` | `string` | – | UUID of the owning campaign |
| `projectId` | `string` | – | UUID of the owning project |
| `userId` | `string` | – | UUID of the owning user |
| `search` | `string` | – | Case-insensitive match on the campaign name |
| `from` | `string` | – | ISO date; strategies created on/after this date |
| `to` | `string` | – | ISO date; strategies created on/before this date |
| `sortBy` | `string` | `createdAt` | `status`, `approvalStatus`, `createdAt`, `updatedAt`, `reviewedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`; when
`sortBy` is given without `sortOrder`, ordering is `ASC`.

### Success response

```json
{
  "data": [
    {
      "id": "s01JABC123",
      "runId": "0f4c...",
      "status": "READY",
      "approvalStatus": "APPROVED",
      "error": null,
      "reviewedAt": "2026-08-10T14:00:00.000Z",
      "reviewerName": "Jane Doe",
      "reviewNote": null,
      "createdAt": "2026-08-10T12:00:00.000Z",
      "updatedAt": "2026-08-10T14:00:00.000Z",
      "campaign": { "id": "cam01JABC123", "name": "Acme launch" },
      "project": { "id": "p_01JABC123", "name": "Acme launch" },
      "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
      "executionCount": 1
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid query parameters, or `from` later than `to` |

## Get one strategy

```http
GET /api/admin/strategies/:id
```

Returns the strategy with its persisted workflow input/output, suspend payload,
pending revision input, and review summary.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The strategy's UUID |

### Success response

The list shape plus `input`, `output`, `suspendPayload`, `pendingRevision`, and
`reviewEventCount`. `input`/`output` are the persisted workflow payloads
(`null` for JSON-null fields).

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Strategy with ID <id> not found` |

## List strategy reviews

```http
GET /api/admin/strategies/:id/reviews
```

Immutable review trail, newest decision first. Reviewer identity is stored as a
snapshot at review time.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The strategy's UUID |

### Success response

```json
{
  "data": [
    {
      "id": "rev01JABC123",
      "action": "APPROVED",
      "note": null,
      "reviewerId": "usr_01JABC123",
      "reviewerName": "Jane Doe",
      "createdAt": "2026-08-10T14:00:00.000Z"
    }
  ],
  "meta": { "total": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Strategy with ID <id> not found` |

## Notes

- The previous untyped `GET /api/admin/strategies`,
  `GET /api/admin/strategies/:id`, and the unsafe
  `PATCH /api/admin/strategies/:id/review` handler (which wrote
  `RUNNING`/`SUSPENDED` directly and bypassed the review workflow) were
  replaced by this read-only module. Human approval goes through the
  domain-owned review endpoint only.

## Content administration

Admin endpoints to inspect generated content across all campaigns. The module
lives under `/api/admin/contents` and is **read-only**: editing, regenerating,
exporting, and deleting content are owner-scoped domain operations.

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/contents` | List generated content with filters, sorting, pagination |
| `GET` | `/api/admin/contents/:id` | Content detail + body + generation metadata + relations |

## List contents

```http
GET /api/admin/contents
```

Every option is optional; an empty query returns the newest content first.

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `status` | `string` | – | `PENDING`, `READY`, or `FAILED` |
| `format` | `string` | – | `TEXT`, `MARKDOWN`, `HTML`, or `JSON` |
| `type` | `string` | – | Case-insensitive partial match on the content type |
| `campaignId` | `string` | – | UUID of the owning campaign |
| `projectId` | `string` | – | UUID of the owning project |
| `userId` | `string` | – | UUID of the owning user |
| `from` | `string` | – | ISO date; content created on/after this date |
| `to` | `string` | – | ISO date; content created on/before this date |
| `sortBy` | `string` | `createdAt` | `type`, `status`, `format`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`.

### Success response

```json
{
  "data": [
    {
      "id": "c01JABC123",
      "type": "instagram_post",
      "title": "Launch teaser",
      "format": "MARKDOWN",
      "status": "READY",
      "version": 1,
      "isEdited": false,
      "error": null,
      "contentRunId": null,
      "createdAt": "2026-08-10T12:30:00.000Z",
      "updatedAt": "2026-08-10T12:30:00.000Z",
      "campaign": { "id": "cam01JABC123", "name": "Acme launch" },
      "project": { "id": "p_01JABC123", "name": "Acme launch" },
      "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | Invalid query parameters, or `from` later than `to` |

## Get one content

```http
GET /api/admin/contents/:id
```

Returns the content with its body, payload, generation prompt, model, and
relations.

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | `string` | The generated content's UUID |

### Success response

The list shape plus `body`, `payload`, `prompt`, and `model`.

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Generated content with ID <id> not found` |

## Social connector administration

Admin endpoints to inspect Meta connectors and connected accounts for
troubleshooting. Token ciphertext is never selected, so credentials are
impossible to leak through these endpoints.

### Endpoint summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/social/connections` | List social connections with filters, sorting, pagination |
| `GET` | `/api/admin/social/connections/:id` | Connection detail + account summary by platform |
| `GET` | `/api/admin/social/accounts` | List social accounts with filters, sorting, pagination |
| `GET` | `/api/admin/social/accounts/:id` | Account detail + connection status/metadata |

## List connections

```http
GET /api/admin/social/connections
```

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `provider` | `string` | – | `META` |
| `status` | `string` | – | `ACTIVE`, `EXPIRED`, `REVOKED`, or `ERROR` |
| `userId` | `string` | – | UUID of the owning user |
| `search` | `string` | – | Case-insensitive match on user name or email |
| `from`/`to` | `string` | – | ISO dates; connections created in range |
| `sortBy` | `string` | `createdAt` | `provider`, `status`, `lastSyncedAt`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

*When `sortBy` is omitted the list is ordered by `createdAt DESC`.

### Success response

```json
{
  "data": [
    {
      "id": "con01JABC123",
      "provider": "META",
      "status": "ACTIVE",
      "externalUserId": null,
      "accessTokenExpiresAt": "2026-09-01T00:00:00.000Z",
      "grantedScopes": ["pages_manage_posts"],
      "lastSyncedAt": "2026-08-10T12:00:00.000Z",
      "lastError": null,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-10T12:00:00.000Z",
      "user": { "id": "usr_01JABC123", "name": "Jane Doe", "email": "jane@example.com" },
      "accountCount": 2
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

## Get one connection

```http
GET /api/admin/social/connections/:id
```

Returns the connection plus an `accountsByPlatform` summary
(`[{ platform, count }]`).

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Social connection with ID <id> not found` |

## List accounts

```http
GET /api/admin/social/accounts
```

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `page` | `number` | `1` | Must be >= 1 |
| `limit` | `number` | `20` | Between 1 and 100 |
| `platform` | `string` | – | `FACEBOOK` or `INSTAGRAM` |
| `available` | `string` | – | `true` or `false` |
| `selected` | `string` | – | `true` or `false` |
| `connectionId` | `string` | – | UUID of the parent connection |
| `userId` | `string` | – | UUID of the owning user |
| `search` | `string` | – | Case-insensitive match on account name or username |
| `from`/`to` | `string` | – | ISO dates; accounts created in range |
| `sortBy` | `string` | `createdAt` | `platform`, `name`, `createdAt`, `updatedAt` |
| `sortOrder` | `string` | `ASC`* | `ASC` or `DESC` |

### Success response

```json
{
  "data": [
    {
      "id": "acc01JABC123",
      "platform": "INSTAGRAM",
      "externalId": "1789...",
      "name": "Acme",
      "username": "acme",
      "imageUrl": null,
      "tasks": [],
      "selected": true,
      "available": true,
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-10T12:00:00.000Z",
      "connection": { "id": "con01JABC123", "provider": "META", "status": "ACTIVE" },
      "publicationCount": 4
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

## Get one account

```http
GET /api/admin/social/accounts/:id
```

Returns the account plus connection metadata (`externalUserId`, `lastSyncedAt`,
`lastError`).

### Possible errors

| Status | Situation |
| --- | --- |
| `400` | `id` is not a valid UUID |
| `404` | `Social account with ID <id> not found` |

## Notes

- These connector endpoints **never** select `accessTokenCiphertext`; only
  identifiers, statuses, and safe metadata are returned.
- The existing untyped `/api/admin/social-connections` and
  `/api/admin/social-accounts` handlers in the base admin controller remain for
  backwards compatibility; this module's typed `/api/admin/social/*` endpoints
  are the recommended replacement.