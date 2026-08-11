/**
 * Workflow ids as registered in the Mastra app's `workflows` map. These are the
 * path segment in every workflow call, so they must match that registry
 * exactly — a typo surfaces as a 404 from the Mastra server, not a type error.
 */
export const MASTRA_WORKFLOWS = {
  strategy: 'marketingStrategyWorkflow',
  strategySectionRevision: 'strategySectionRevisionWorkflow',
  content: 'contentCreationWorkflow',
} as const;

export type MastraWorkflowId =
  (typeof MASTRA_WORKFLOWS)[keyof typeof MASTRA_WORKFLOWS];

/**
 * Terminal state Mastra reports for a run. `suspended` is not a failure: the
 * content workflow pauses for human approval and is picked back up by resuming
 * the same run id.
 */
export type MastraRunStatus = 'success' | 'failed' | 'suspended';

/** Terminal envelope assembled from Mastra's persisted workflow state. */
export interface MastraWorkflowResult<TResult = unknown> {
  status: MastraRunStatus;
  /** Present when `status` is `success`. */
  result?: TResult;
  /** Present when `status` is `failed`. Shape is not guaranteed. */
  error?: unknown;
  /** Steps the run is waiting on, present when `status` is `suspended`. */
  suspended?: unknown;
  /** Per-step payloads. Useful for surfacing progress and for debugging. */
  steps?: Record<string, unknown>;
}

export interface MastraWorkflowUsage {
  status: 'ready' | 'pending' | 'unpriced';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number | null;
  costUnit: string | null;
  models: Array<{
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number | null;
    costUnit: string | null;
  }>;
}

/**
 * Raised for anything that went wrong reaching Mastra — a connection refused, a
 * non-2xx response, a body that is not JSON. Distinct from a run that reached
 * Mastra and came back `failed`, which is a normal result, not an exception.
 */
export class MastraRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'MastraRequestError';
  }
}
