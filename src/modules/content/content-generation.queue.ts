export const CONTENT_GENERATION_QUEUE = 'content-generation';

/**
 * Job payload is deliberately nothing but identifiers. The worker re-reads the
 * row, the campaign and the project when it actually runs, so a job that sat in
 * the queue for a while never writes content built from a stale brief.
 */
export interface ContentGenerationJob {
  contentId: string;
  /** Version to stamp on the row once the agent succeeds. */
  version: number;
  /** Feed the row's current output back to the agent (regenerate only). */
  usePrevious: boolean;
}
