import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { MastraClient } from './mastra.client';
import { MastraWorkflowId } from './mastra.types';

type PersistedRun = {
  runId: string | null;
  status: string;
  error: string | null;
  updatedAt: Date;
};

type WorkflowProgress = {
  status: 'running' | 'success' | 'failed' | 'suspended' | 'canceled';
  activeSteps: string[];
  completedSteps: string[];
  error?: string | null;
  updatedAt: string;
};

function clientStatus(status: string): WorkflowProgress['status'] {
  if (status === 'READY' || status === 'success') return 'success';
  if (status === 'FAILED' || status === 'failed') return 'failed';
  if (status === 'SUSPENDED' || status === 'suspended') return 'suspended';
  if (status === 'CANCELED' || status === 'canceled') return 'canceled';
  return 'running';
}

function stepState(value: unknown): {
  activeSteps: string[];
  completedSteps: string[];
} {
  if (!value || typeof value !== 'object') {
    return { activeSteps: [], completedSteps: [] };
  }

  const steps = (value as { steps?: unknown }).steps;
  if (!steps || typeof steps !== 'object') {
    return { activeSteps: [], completedSteps: [] };
  }

  const activeSteps: string[] = [];
  const completedSteps: string[] = [];
  for (const [id, step] of Object.entries(steps as Record<string, unknown>)) {
    const status =
      step && typeof step === 'object'
        ? (step as { status?: unknown }).status
        : undefined;
    if (status === 'running') activeSteps.push(id);
    if (status === 'success') completedSteps.push(id);
  }
  return { activeSteps, completedSteps };
}

/**
 * Bridges Mastra's run inspection endpoint to authenticated browser SSE.
 * The browser receives compact progress deltas; complete workflow output stays
 * in the normal persisted-run endpoint so reconnects always have one source
 * of truth.
 */
@Injectable()
export class MastraRunEventsService {
  constructor(private readonly mastra: MastraClient) {}

  stream(
    workflowId: MastraWorkflowId,
    load: () => Promise<PersistedRun>,
  ): Observable<{ data: WorkflowProgress }> {
    return new Observable((subscriber) => {
      let closed = false;
      let polling = false;
      let previous = '';

      const emit = (progress: WorkflowProgress) => {
        const serialized = JSON.stringify(progress);
        if (serialized === previous) return;
        previous = serialized;
        subscriber.next({ data: progress });
      };

      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          const record = await load();
          const base: WorkflowProgress = {
            status: clientStatus(record.status),
            activeSteps: [],
            completedSteps: [],
            error: record.error,
            updatedAt: record.updatedAt.toISOString(),
          };

          if (record.runId && base.status === 'running') {
            try {
              const mastraRun = await this.mastra.getRun(
                workflowId,
                record.runId,
              );
              emit({ ...base, ...stepState(mastraRun) });
            } catch {
              // The durable database status is still useful if Mastra is
              // briefly unavailable. The next interval retries inspection.
              emit(base);
            }
          } else {
            emit(base);
          }
        } catch (error) {
          subscriber.error(error);
        } finally {
          polling = false;
        }
      };

      void poll();
      const timer = setInterval(() => void poll(), 1_500);
      return () => {
        closed = true;
        clearInterval(timer);
      };
    });
  }
}
