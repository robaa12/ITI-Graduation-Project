import {
  Prisma,
  WorkflowAccountingStatus,
  WorkflowExecution,
  WorkflowExecutionKind,
  WorkflowRunStatus,
} from '@prisma/client';

import { presentWorkflowAccounting } from './workflow-accounting.presenter';

describe('presentWorkflowAccounting', () => {
  it('returns a cumulative strategy total without losing individual executions', () => {
    const result = presentWorkflowAccounting([
      execution({ inputTokens: 100, outputTokens: 20, cost: '0.0100000000' }),
      execution({
        id: 'revision',
        kind: WorkflowExecutionKind.STRATEGY_SECTION_REVISION,
        inputTokens: 50,
        outputTokens: 10,
        cost: '0.0050000000',
      }),
    ]);

    expect(result.billing).toEqual({
      status: 'ready',
      inputTokens: 150,
      outputTokens: 30,
      totalTokens: 180,
      estimatedCostUsd: '0.0150000000',
    });
    expect(result.executions).toHaveLength(2);
    expect(result.executions[1].kind).toBe('strategy_section_revision');
  });

  it('does not expose a partial total while any execution is unpriced', () => {
    const result = presentWorkflowAccounting([
      execution({ inputTokens: 100, outputTokens: 20, cost: '0.01' }),
      execution({
        id: 'unpriced',
        accountingStatus: WorkflowAccountingStatus.UNPRICED,
        inputTokens: 5,
        outputTokens: 2,
      }),
    ]);

    expect(result.billing.status).toBe('unpriced');
    expect(result.billing.estimatedCostUsd).toBeNull();
    expect(result.billing.totalTokens).toBe(127);
  });

  it('marks legacy records without executions as unavailable', () => {
    expect(presentWorkflowAccounting([]).billing.status).toBe('unavailable');
  });
});

function execution(overrides: {
  id?: string;
  kind?: WorkflowExecutionKind;
  accountingStatus?: WorkflowAccountingStatus;
  inputTokens?: number;
  outputTokens?: number;
  cost?: string;
}): WorkflowExecution {
  const inputTokens = overrides.inputTokens ?? 0;
  const outputTokens = overrides.outputTokens ?? 0;
  const now = new Date('2026-08-12T00:00:00.000Z');
  return {
    id: overrides.id ?? 'initial',
    mastraRunId: overrides.id ?? 'initial-run',
    workflowId: 'marketingStrategyWorkflow',
    kind: overrides.kind ?? WorkflowExecutionKind.STRATEGY,
    status: WorkflowRunStatus.READY,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost: overrides.cost ? new Prisma.Decimal(overrides.cost) : null,
    costUnit: overrides.cost ? 'USD' : null,
    accountingStatus:
      overrides.accountingStatus ?? WorkflowAccountingStatus.READY,
    modelBreakdown: null,
    usageCollectedAt: now,
    startedAt: now,
    finishedAt: now,
    strategyId: 'strategy-id',
    contentRunId: null,
    createdAt: now,
    updatedAt: now,
  };
}
