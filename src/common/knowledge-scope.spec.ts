import { KnowledgeSourceType } from '@prisma/client';

import { buildKnowledgeScope } from './knowledge-scope';

describe('buildKnowledgeScope', () => {
  it('snapshots only metadata needed to reproduce an owned RAG boundary', () => {
    expect(
      buildKnowledgeScope('project-1', [
        {
          id: 'source-1',
          type: KnowledgeSourceType.DOCUMENT,
          name: 'Brand guidelines',
          url: null,
          indexedAt: new Date('2026-08-13T00:00:00.000Z'),
          metadata: { indexVersion: 'pgvector-v1', contentHash: 'not-exposed' },
        },
      ]),
    ).toEqual({
      projectId: 'project-1',
      sourceIds: ['source-1'],
      sourceSnapshots: [
        {
          sourceId: 'source-1',
          sourceType: KnowledgeSourceType.DOCUMENT,
          name: 'Brand guidelines',
          indexedAt: '2026-08-13T00:00:00.000Z',
          indexVersion: 'pgvector-v1',
        },
      ],
    });
  });
});
