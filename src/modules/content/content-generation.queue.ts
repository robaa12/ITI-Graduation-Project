export const CONTENT_GENERATION_QUEUE = 'content-generation';

/**
 * Job payload is deliberately nothing but identifiers. The worker re-reads the
 * row, the campaign and the project when it actually runs, so a job that sat in
 * the queue for a while never writes content built from a stale brief.
 */
export interface ContentGenerationJob {
  contentId: string;
  /**
   * Value of `generationRevision` reserved for this job. The worker writes its
   * result only while the row still carries it — anything that supersedes the
   * job (a newer regenerate, a manual edit) bumps the row past this number and
   * the late result is dropped.
   */
  revision: number;
  /** Feed the row's current output back to the agent (regenerate only). */
  usePrevious: boolean;
}
