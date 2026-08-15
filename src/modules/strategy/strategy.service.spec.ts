import { Prisma, WorkflowRunStatus } from '@prisma/client';

import { StrategyService } from './strategy.service';

describe('StrategyService cancellation', () => {
  const strategyId = 'b289c564-c593-46a7-ba31-8e1dd628308c';
  const running = {
    id: strategyId,
    status: WorkflowRunStatus.RUNNING,
    runId: 'mastra-run-id',
  };

  const marketingStrategy = {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  };
  const mastra = { cancelRun: jest.fn() };
  const generationCredits = { refund: jest.fn() };
  const prisma = { marketingStrategy };
  const service = new StrategyService(
    prisma as never,
    {} as never,
    {},
    mastra as never,
    generationCredits as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    marketingStrategy.findFirst
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce({
        ...running,
        status: WorkflowRunStatus.CANCELED,
      });
    marketingStrategy.updateMany.mockResolvedValue({ count: 1 });
    mastra.cancelRun.mockResolvedValue(undefined);
    generationCredits.refund.mockResolvedValue(undefined);
  });

  it('persists cancellation and stops the matching Mastra run', async () => {
    const result = await service.cancel('user-id', strategyId);

    expect(marketingStrategy.updateMany).toHaveBeenCalledWith({
      where: {
        id: strategyId,
        status: {
          in: [
            WorkflowRunStatus.PENDING,
            WorkflowRunStatus.RUNNING,
            WorkflowRunStatus.SUSPENDED,
          ],
        },
      },
      data: {
        status: WorkflowRunStatus.CANCELED,
        error: null,
        suspendPayload: Prisma.DbNull,
      },
    });
    expect(mastra.cancelRun).toHaveBeenCalledWith(
      'marketingStrategyWorkflow',
      'mastra-run-id',
    );
    expect(generationCredits.refund).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(WorkflowRunStatus.CANCELED);
  });
});
