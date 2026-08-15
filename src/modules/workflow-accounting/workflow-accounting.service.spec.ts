import {
  WorkflowAccountingStatus,
  WorkflowExecutionKind,
  WorkflowRunStatus,
} from '@prisma/client';

import { WorkflowAccountingService } from './workflow-accounting.service';

describe('WorkflowAccountingService', () => {
  const execution = {
    id: 'execution-id',
    mastraRunId: 'mastra-run-id',
    workflowId: 'marketingStrategyWorkflow',
    kind: WorkflowExecutionKind.STRATEGY,
    status: WorkflowRunStatus.READY,
    accountingStatus: WorkflowAccountingStatus.PENDING,
  };

  it('persists Mastra token usage and USD pricing', async () => {
    const updateMany = jest.fn((args: { data: Record<string, unknown> }) => {
      void args;
      return Promise.resolve({ count: 1 });
    });
    const service = createService({
      prisma: {
        workflowExecution: {
          findUnique: jest.fn().mockResolvedValue(execution),
          updateMany,
        },
      },
      mastra: {
        getWorkflowUsage: jest.fn().mockResolvedValue({
          status: 'ready',
          inputTokens: 120,
          outputTokens: 30,
          totalTokens: 150,
          estimatedCost: 0.0123,
          costUnit: 'USD',
          models: [
            {
              provider: 'test',
              model: 'model',
              inputTokens: 120,
              outputTokens: 30,
              totalTokens: 150,
              estimatedCost: 0.0123,
              costUnit: 'USD',
            },
          ],
        }),
      },
    });

    await expect(service.collect(execution.id)).resolves.toBe(
      WorkflowAccountingStatus.READY,
    );
    expect(updateMany).toHaveBeenCalled();
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      accountingStatus: WorkflowAccountingStatus.READY,
    });
  });

  it('queues bounded reconciliation when Mastra metrics are pending', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      prisma: {
        workflowExecution: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: execution.id })
            .mockResolvedValueOnce(execution),
        },
      },
      mastra: {
        getWorkflowUsage: jest.fn().mockResolvedValue({ status: 'pending' }),
      },
      queue: { add },
    });

    await service.collectOrSchedule(execution.mastraRunId);
    expect(add).toHaveBeenCalledWith(
      'reconcile',
      { executionId: execution.id },
      expect.objectContaining({
        attempts: 20,
        backoff: { type: 'fixed', delay: 15_000 },
      }),
    );
  });

  it('repairs unavailable terminal usage when a result is opened later', async () => {
    const unavailableExecution = {
      ...execution,
      accountingStatus: WorkflowAccountingStatus.UNAVAILABLE,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const repairedExecution = {
      ...unavailableExecution,
      accountingStatus: WorkflowAccountingStatus.READY,
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
    };
    const service = createService({
      prisma: {
        workflowExecution: {
          findUnique: jest.fn().mockResolvedValue(unavailableExecution),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findMany: jest.fn().mockResolvedValue([repairedExecution]),
        },
      },
      mastra: {
        getWorkflowUsage: jest.fn().mockResolvedValue({
          status: 'ready',
          inputTokens: 120,
          outputTokens: 30,
          totalTokens: 150,
          estimatedCost: 0.0123,
          costUnit: 'USD',
          models: [],
        }),
      },
    });

    await expect(
      service.reconcileForPresentation([unavailableExecution as never]),
    ).resolves.toEqual([repairedExecution]);
  });

  it('stores tokens but not a partial total for unpriced models', async () => {
    const updateMany = jest.fn((args: { data: Record<string, unknown> }) => {
      void args;
      return Promise.resolve({ count: 1 });
    });
    const service = createService({
      prisma: {
        workflowExecution: {
          findUnique: jest.fn().mockResolvedValue(execution),
          updateMany,
        },
      },
      mastra: {
        getWorkflowUsage: jest.fn().mockResolvedValue({
          status: 'unpriced',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          estimatedCost: null,
          costUnit: null,
          models: [],
        }),
      },
    });

    await expect(service.collect(execution.id)).resolves.toBe(
      WorkflowAccountingStatus.UNPRICED,
    );
    expect(updateMany).toHaveBeenCalled();
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      estimatedCost: null,
      accountingStatus: WorkflowAccountingStatus.UNPRICED,
    });
  });
});

function createService({
  prisma,
  mastra,
  queue = { add: jest.fn() },
}: {
  prisma: unknown;
  mastra: unknown;
  queue?: unknown;
}) {
  return new WorkflowAccountingService(
    prisma as never,
    mastra as never,
    queue as never,
  );
}
