import { KnowledgeSourceType, Prisma } from '@prisma/client';

export interface ReadyKnowledgeSourceSnapshotInput {
  id: string;
  type: KnowledgeSourceType;
  name: string;
  url: string | null;
  indexedAt: Date | null;
  metadata: Prisma.JsonValue | null;
}

/**
 * Builds the server-authoritative RAG boundary for one workflow run. Keeping
 * source details here makes the run reproducible without trusting browser
 * input or duplicating source content in workflow records.
 */
export function buildKnowledgeScope(
  projectId: string,
  sources: ReadyKnowledgeSourceSnapshotInput[],
) {
  return {
    projectId,
    sourceIds: sources.map((source) => source.id),
    sourceSnapshots: sources.map((source) => {
      const metadata = asObject(source.metadata);
      const indexVersion = metadata['indexVersion'];
      return {
        sourceId: source.id,
        sourceType: source.type,
        name: source.name,
        ...(source.url ? { url: source.url } : {}),
        ...(source.indexedAt
          ? { indexedAt: source.indexedAt.toISOString() }
          : {}),
        ...(typeof indexVersion === 'string' && indexVersion
          ? { indexVersion }
          : {}),
      };
    }),
  };
}

function asObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
