export const STRATEGY_QUEUE = 'marketing-strategy';

/**
 * The job carries only the row id. Everything else — the reserved Mastra run
 * id and the input payload — is read from the row when the worker starts, so a
 * job that waited in the queue never runs against a stale copy.
 */
export interface StrategyJob {
  strategyId: string;
}
