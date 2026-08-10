export interface WorkflowProgressSnapshot {
  activeSteps: string[];
  completedSteps: string[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

/**
 * Mastra's run inspection endpoint is intentionally loosely typed across
 * versions. Convert its known progress fields to the compact, stable shape the
 * API exposes to the UI, while ignoring fields we do not recognise.
 */
export function extractWorkflowProgress(
  snapshot: unknown,
): WorkflowProgressSnapshot | undefined {
  if (!isRecord(snapshot)) return undefined;

  const active = new Set<string>();
  const completed = new Set<string>();
  const steps = isRecord(snapshot.steps) ? snapshot.steps : undefined;

  if (steps) {
    for (const [stepId, value] of Object.entries(steps)) {
      if (!isRecord(value) || typeof value.status !== 'string') continue;
      const status = value.status.toLowerCase();
      if (['success', 'completed', 'complete'].includes(status)) {
        completed.add(stepId);
      }
      if (['running', 'pending', 'started', 'executing'].includes(status)) {
        active.add(stepId);
      }
    }
  }

  const activePaths = snapshot.activeStepsPath;
  if (isRecord(activePaths)) {
    for (const stepId of Object.keys(activePaths)) active.add(stepId);
  } else if (Array.isArray(activePaths)) {
    for (const stepId of activePaths) {
      if (typeof stepId === 'string') active.add(stepId);
    }
  }

  return active.size || completed.size
    ? { activeSteps: unique(active), completedSteps: unique(completed) }
    : undefined;
}
