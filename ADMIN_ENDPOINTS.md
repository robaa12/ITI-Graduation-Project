| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/dashboard/overview` | ADMIN | Dashboard statistics (users, projects, workflows, content, knowledge, social, strategies, campaigns) |
| GET | `/api/admin/users` | ADMIN | List users (search, role filter, sort, pagination) |
| GET | `/api/admin/users/statistics` | ADMIN | Total users grouped by role |
| GET | `/api/admin/users/:id` | ADMIN | Get one user |
| PATCH | `/api/admin/users/:id` | ADMIN | Update user name/image |
| PATCH | `/api/admin/users/:id/role` | ADMIN | Change user role |
| DELETE | `/api/admin/users/:id` | ADMIN | Delete user (self-delete blocked; guarded) |
| GET | `/api/admin/projects` | ADMIN | List projects (search, status, ownerId, sort, pagination) |
| GET | `/api/admin/projects/:id` | ADMIN | Project details + owner + relation summaries |
| PATCH | `/api/admin/projects/:id` | ADMIN | Update project fields / status |
| DELETE | `/api/admin/projects/:id` | ADMIN | Delete project (409 if it has campaigns/knowledge sources) |
| GET | `/api/admin/knowledge/sources` | ADMIN | List knowledge sources (filters, sort, pagination) |
| GET | `/api/admin/knowledge/sources/:id` | ADMIN | Source detail + project owner + crawl metadata |
| POST | `/api/admin/knowledge/sources` | ADMIN | Create website source (202, queued index) |
| PATCH | `/api/admin/knowledge/sources/:id` | ADMIN | Update name / URL (URL change re-crawls) |
| DELETE | `/api/admin/knowledge/sources/:id` | ADMIN | Delete source (pages cascade, vector cleanup) |
| POST | `/api/admin/knowledge/sources/:id/refresh` | ADMIN | Recrawl + re-index source (202) |
| GET | `/api/admin/knowledge/pages` | ADMIN | List crawled pages (filters, sort, pagination) |
| GET | `/api/admin/knowledge/pages/:id` | ADMIN | Page detail + source + project |
| GET | `/api/admin/campaigns` | ADMIN | List campaigns (search, status, projectId, dates, sort) |
| GET | `/api/admin/campaigns/:id` | ADMIN | Campaign detail + owner + relation summaries |
| PATCH | `/api/admin/campaigns/:id` | ADMIN | Update editable fields (published → draft) |
| DELETE | `/api/admin/campaigns/:id` | ADMIN | Delete campaign (cascades relations) |
| POST | `/api/admin/campaigns/:id/publish` | ADMIN | Publish draft campaign |
| POST | `/api/admin/campaigns/:id/unpublish` | ADMIN | Take published campaign offline |
| GET | `/api/admin/campaigns/:id/contents` | ADMIN | List generated content (paginated) |
| GET | `/api/admin/campaigns/:id/publications` | ADMIN | List social publications (paginated) |
| GET | `/api/admin/campaigns/:id/strategies` | ADMIN | List strategy workflow runs |
| GET | `/api/admin/campaigns/:id/content-runs` | ADMIN | List content workflow runs |
| GET | `/api/admin/workflows/executions` | ADMIN | List executions (filters, sort, pagination, cost/tokens) |
| GET | `/api/admin/workflows/executions/:id` | ADMIN | Execution detail + refs + input/output + accounting + agents |
| GET | `/api/admin/workflows/executions/:id/agents` | ADMIN | Per-model agent usage (tokens, cost) |
| GET | `/api/admin/workflows/statistics` | ADMIN | Aggregate stats (totals, cost, duration, by workflow/model) |
| GET | `/api/admin/social/publications` | ADMIN | List publications (filters, sort, pagination) |
| GET | `/api/admin/social/publications/:id` | ADMIN | Publication detail + content/campaign/project/account refs |
| PATCH | `/api/admin/social/publications/:id` | ADMIN | Edit caption (QUEUED/SCHEDULED/FAILED only) |
| DELETE | `/api/admin/social/publications/:id` | ADMIN | Cancel publication (soft delete, queued/scheduled only) |
| GET | `/api/admin/billing/overview` | ADMIN | Billing statistics and revenue |
| GET | `/api/admin/billing/subscriptions` | ADMIN | List subscriptions (filters, sort, pagination) |
| GET | `/api/admin/billing/subscriptions/:id` | ADMIN | Subscription detail + user/plan + quote/event counts |
| GET | `/api/admin/billing/plans` | ADMIN | List plans (active filter, sort, pagination) |
| GET | `/api/admin/billing/plans/:id` | ADMIN | Plan detail + subscriber count |
| GET | `/api/admin/billing/quotes` | ADMIN | List plan-change quotes (filters, sort, pagination) |
| GET | `/api/admin/billing/quotes/:id` | ADMIN | Quote detail + user/plan/subscription |
| GET | `/api/admin/billing/events` | ADMIN | List Stripe webhook events (audit trail) |
| GET | `/api/admin/billing/events/:id` | ADMIN | Event detail with sanitized raw payload |
| GET | `/api/admin/billing/credit-events` | ADMIN | List generation credit events |
| GET | `/api/admin/billing/credit-events/:id` | ADMIN | Credit event detail + user |
| GET | `/api/admin/strategies` | ADMIN | List strategies (filters, sort, pagination) |
| GET | `/api/admin/strategies/:id` | ADMIN | Strategy detail + input/output + review summary |
| GET | `/api/admin/strategies/:id/reviews` | ADMIN | Strategy review trail |
| GET | `/api/admin/contents` | ADMIN | List generated content (filters, sort, pagination) |
| GET | `/api/admin/contents/:id` | ADMIN | Content detail + body + generation metadata |
| GET | `/api/admin/social/connections` | ADMIN | List social connections (filters, sort, pagination) |
| GET | `/api/admin/social/connections/:id` | ADMIN | Connection detail + accounts by platform |
| GET | `/api/admin/social/accounts` | ADMIN | List social accounts (filters, sort, pagination) |
| GET | `/api/admin/social/accounts/:id` | ADMIN | Account detail + connection status/metadata |
