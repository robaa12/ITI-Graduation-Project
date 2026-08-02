export const CONTENT_WORKFLOW_QUEUE = 'content-workflow';

/**
 * Only the row id travels on the queue. The reserved Mastra run id and the
 * fully-assembled input (including the strategy that was folded in) are read
 * back from the row when the worker starts.
 */
export interface ContentWorkflowJob {
  contentRunId: string;
}
