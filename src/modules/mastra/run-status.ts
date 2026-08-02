import { WorkflowRunStatus } from '@prisma/client';

import { MastraWorkflowResult } from './mastra.types';

/**
 * Maps a Mastra result envelope onto the status stored on our row.
 *
 * Anything Mastra reports that is not one of its three known states is treated
 * as a failure rather than passed through: an unrecognised status must not
 * leave a row sitting in PENDING with nothing left to settle it.
 */
export function toWorkflowRunStatus(
  result: MastraWorkflowResult,
): WorkflowRunStatus {
  switch (result.status) {
    case 'success':
      return WorkflowRunStatus.READY;
    case 'suspended':
      return WorkflowRunStatus.SUSPENDED;
    case 'failed':
    default:
      return WorkflowRunStatus.FAILED;
  }
}

/**
 * Best-effort human-readable reason from a failed run. Mastra does not promise
 * a shape for `error`, so this handles the plausible ones and falls back to a
 * serialisation rather than storing "[object Object]".
 */
export function toErrorMessage(result: MastraWorkflowResult): string {
  const { error } = result;

  if (error === undefined || error === null) {
    return result.status === 'failed'
      ? 'Workflow failed without reporting a reason'
      : `Unexpected workflow status: ${String(result.status)}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string') {
      return message;
    }
  }

  try {
    // Objects have no useful default stringification, so serialise instead of
    // letting one land in the column as "[object Object]".
    return JSON.stringify(error) ?? 'Workflow failed with an unreadable error';
  } catch {
    return 'Workflow failed with an unserialisable error';
  }
}
