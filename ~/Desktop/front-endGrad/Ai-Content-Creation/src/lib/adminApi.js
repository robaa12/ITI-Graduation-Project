// Client for the backend Admin API served at /api/admin (proxied to
// the NestJS server in dev by vite.config.js). It relies on Better Auth's
// HTTP-only session cookie, so every request uses credentials.

const BASE = '/api/admin'

export { getErrorMessage } from '@/lib/errors'

export class AdminApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.data = data
  }
}

function extractError(data, fallback) {
  const message = data?.message
  if (Array.isArray(message)) {
    const joined = message.filter(Boolean).join('; ')
    if (joined) return joined
  }
  if (typeof message === 'string' && message.trim()) return message
  if (typeof data?.error === 'string' && data.error.trim()) return data.error
  return fallback
}

async function adminFetch(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new AdminApiError(
      'Could not reach the admin service. Check that the server is running.',
      { data: error },
    )
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new AdminApiError(extractError(data, `Request failed with status ${response.status}`), {
      status: response.status,
      data,
    })
  }
  return data
}

/**
 * ===== Step 1: User Management =====
 */

/** GET /admin/users - Paginated list of users */
export function getAdminUsers({ page, limit, search, status } = {}) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (search) params.append('search', search)
  if (status) params.append('status', status)
  return adminFetch(`/users?${params.toString()}`)
}

/** GET /admin/users/:id - Get user by ID */
export function getAdminUserById(id) {
  return adminFetch(`/users/${id}`)
}

/** PATCH /admin/users/:id/status - Update user status */
export function updateUserStatus(id, status) {
  return adminFetch(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

/** PATCH /admin/users/:id/role - Update user role */
export function updateUserRole(id, role) {
  return adminFetch(`/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

/** DELETE /admin/users/:id - Delete user */
export function deleteUser(id) {
  return adminFetch(`/users/${id}`, { method: 'DELETE' })
}

/**
 * ===== Step 2: Resource Management =====
 */

/* --- Projects --- */
export function getAdminProjects({ page, limit, search, status }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (search) params.append('search', search)
  if (status) params.append('status', status)
  return adminFetch(`/projects?${params.toString()}`)
}

export function getAdminProjectById(id) {
  return adminFetch(`/projects/${id}`)
}

export function updateAdminProjectStatus(id, status) {
  return adminFetch(`/projects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

/* --- Campaigns --- */
export function getAdminCampaigns({ page, limit, search, status, projectId }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (search) params.append('search', search)
  if (status) params.append('status', status)
  if (projectId) params.append('projectId', projectId)
  return adminFetch(`/campaigns?${params.toString()}`)
}

export function getAdminCampaignById(id) {
  return adminFetch(`/campaigns/${id}`)
}

/* --- Strategies --- */
export function getAdminStrategies({ page, limit, status, approvalStatus, campaignId }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (status) params.append('status', status)
  if (approvalStatus) params.append('approvalStatus', approvalStatus)
  if (campaignId) params.append('campaignId', campaignId)
  return adminFetch(`/strategies?${params.toString()}`)
}

export function getAdminStrategyById(id) {
  return adminFetch(`/strategies/${id}`)
}

export function adminReviewStrategy(id, action, note) {
  return adminFetch(`/strategies/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ action, note }),
  })
}

/* --- Generated Content --- */
export function getAdminGeneratedContent({ page, limit, status, format, campaignId }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (status) params.append('status', status)
  if (format) params.append('format', format)
  if (campaignId) params.append('campaignId', campaignId)
  return adminFetch(`/generated-content?${params.toString()}`)
}

export function getAdminGeneratedContentById(id) {
  return adminFetch(`/generated-content/${id}`)
}

/* --- Knowledge Sources --- */
export function getAdminKnowledgeSources({ page, limit, search, type, status, projectId }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (search) params.append('search', search)
  if (type) params.append('type', type)
  if (status) params.append('status', status)
  if (projectId) params.append('projectId', projectId)
  return adminFetch(`/knowledge-sources?${params.toString()}`)
}

export function getAdminKnowledgeSourceById(id) {
  return adminFetch(`/knowledge-sources/${id}`)
}

/* --- Social Connections --- */
export function getAdminSocialConnections({ page, limit, provider, status, userId }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (provider) params.append('provider', provider)
  if (status) params.append('status', status)
  if (userId) params.append('userId', userId)
  return adminFetch(`/social-connections?${params.toString()}`)
}

export function getAdminSocialConnectionById(id) {
  return adminFetch(`/social-connections/${id}`)
}

/* --- Social Accounts --- */
export function getAdminSocialAccounts({ page, limit, platform, available, selected, userId }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (platform) params.append('platform', platform)
  if (available !== undefined) params.append('available', String(available))
  if (selected !== undefined) params.append('selected', String(selected))
  if (userId) params.append('userId', userId)
  return adminFetch(`/social-accounts?${params.toString()}`)
}

export function getAdminSocialAccountById(id) {
  return adminFetch(`/social-accounts/${id}`)
}

/**
 * ===== Step 3: Subscription / Plan Management =====
 */

/** GET /admin/plans - List plans */
export function getAdminPlans({ page, limit, active }) {
  const params = new URLSearchParams()
  if (page !== undefined) params.append('page', String(page))
  if (limit !== undefined) params.append('limit', String(limit))
  if (active !== undefined) params.append('active', String(active))
  return adminFetch(`/plans?${params.toString()}`)
}

export function getAdminPlanById(id) {
  return adminFetch(`/plans/${id}`)
}

/**
 * ===== Step 3: Revenue Analytics =====
 */

/** GET /admin/dashboard/revenue */
export function getAdminRevenueOverview() {
  return adminFetch('/dashboard/revenue')
}

/** GET /admin/dashboard/revenue/users */
export function getAdminRevenuePerUser({ userId } = {}) {
  const params = new URLSearchParams()
  if (userId) params.append('userId', userId)
  return adminFetch(`/dashboard/revenue/users?${params.toString()}`)
}

/** GET /admin/dashboard/revenue/plans */
export function getAdminRevenuePerPlan({ planId } = {}) {
  const params = new URLSearchParams()
  if (planId) params.append('planId', planId)
  return adminFetch(`/dashboard/revenue/plans?${params.toString()}`)
}

/**
 * ===== Step 3: Generation Credit Events =====
 */

/** GET /admin/credit-events */
export function getAdminCreditEvents({ userId, kind, refunded, startDate, endDate }) {
  const params = new URLSearchParams()
  if (userId) params.append('userId', userId)
  if (kind) params.append('kind', kind)
  if (refunded !== undefined) params.append('refunded', String(refunded))
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  return adminFetch(`/credit-events?${params.toString()}`)
}

/** GET /admin/users/:id/credit-events */
export function getAdminUserCreditEvents(id, { kind, refunded, startDate, endDate } = {}) {
  const params = new URLSearchParams()
  if (kind) params.append('kind', kind)
  if (refunded !== undefined) params.append('refunded', String(refunded))
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  return adminFetch(`/users/${id}/credit-events?${params.toString()}`)
}

/**
 * ===== Step 3: Workflow Executions =====
 */

/** GET /admin/workflow-executions */
export function getAdminWorkflowExecutions({ userId, kind, status, accountingStatus, startDate, endDate }) {
  const params = new URLSearchParams()
  if (userId) params.append('userId', userId)
  if (kind) params.append('kind', kind)
  if (status) params.append('status', status)
  if (accountingStatus) params.append('accountingStatus', accountingStatus)
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  return adminFetch(`/workflow-executions?${params.toString()}`)
}

/** GET /admin/workflow-executions/:id */
export function getAdminWorkflowExecutionById(id, sanitize = true) {
  return adminFetch(`/workflow-executions/${id}?sanitize=${sanitize}`)
}

/**
 * ===== Step 3: Email Management =====
 */

/** GET /admin/emails */
export function getAdminEmails({ status, userId, startDate, endDate }) {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (userId) params.append('userId', userId)
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  return adminFetch(`/emails?${params.toString()}`)
}

/** GET /admin/emails/:id */
export function getAdminEmailById(id) {
  return adminFetch(`/emails/${id}`)
}

/** POST /admin/emails/:id/cancel */
export function cancelAdminEmail(id, force = false) {
  return adminFetch(`/emails/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ force }),
  })
}

/** POST /admin/emails/:id/retry */
export function retryAdminEmail(id) {
  return adminFetch(`/emails/${id}/retry`, { method: 'POST' })
}