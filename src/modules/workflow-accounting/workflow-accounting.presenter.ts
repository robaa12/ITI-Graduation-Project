import {
  Prisma,
  WorkflowAccountingStatus,
  WorkflowExecution,
} from '@prisma/client';

export function presentWorkflowAccounting(executions: WorkflowExecution[]) {
  const billing = summarizeBilling(executions);
  return {
    billing,
    executions: executions.map((execution) => ({
      id: execution.id,
      mastraRunId: execution.mastraRunId,
      workflowId: execution.workflowId,
      kind: execution.kind.toLowerCase(),
      status: execution.status.toLowerCase(),
      billing: summarizeBilling([execution]),
      models: Array.isArray(execution.modelBreakdown)
        ? execution.modelBreakdown
        : [],
      startedAt: execution.startedAt?.toISOString() ?? null,
      finishedAt: execution.finishedAt?.toISOString() ?? null,
      createdAt: execution.createdAt.toISOString(),
    })),
  };
}

function summarizeBilling(executions: WorkflowExecution[]) {
  const inputTokens = executions.reduce(
    (sum, execution) => sum + execution.inputTokens,
    0,
  );
  const outputTokens = executions.reduce(
    (sum, execution) => sum + execution.outputTokens,
    0,
  );
  const statuses = new Set(executions.map((item) => item.accountingStatus));
  let status: 'pending' | 'ready' | 'unpriced' | 'unavailable';
  if (executions.length === 0) status = 'unavailable';
  else if (statuses.has(WorkflowAccountingStatus.PENDING)) status = 'pending';
  else if (statuses.has(WorkflowAccountingStatus.UNAVAILABLE)) {
    status = 'unavailable';
  } else if (statuses.has(WorkflowAccountingStatus.UNPRICED)) {
    status = 'unpriced';
  } else status = 'ready';

  const cost = executions.reduce(
    (sum, execution) =>
      execution.estimatedCost ? sum.plus(execution.estimatedCost) : sum,
    new Prisma.Decimal(0),
  );

  return {
    status,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: status === 'ready' ? cost.toFixed(10) : null,
  };
}
