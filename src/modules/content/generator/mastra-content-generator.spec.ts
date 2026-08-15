import { ContentFormat } from '@prisma/client';

import { MastraClient } from '../../mastra/mastra.client';
import { MastraContentGenerator } from './mastra-content-generator';

const brief = {
  project: { id: 'project-1', name: 'Acme', description: null },
  campaign: {
    id: 'campaign-1',
    name: 'Launch',
    description: null,
    objective: 'Drive trials',
    audience: 'Marketing leads',
    tone: 'Direct',
    channels: ['linkedin'],
    startDate: null,
    endDate: null,
  },
  type: 'linkedin',
};

describe('MastraContentGenerator', () => {
  it('maps a valid Mastra response to the generator port', async () => {
    const mastra = {
      generateContentItem: jest.fn().mockResolvedValue({
        type: 'linkedin',
        title: 'Launch post',
        body: 'Meet the faster way to plan campaigns.',
        payload: { cta: 'Start a trial' },
        format: 'MARKDOWN',
        model: 'openai/gpt-test',
      }),
    } as unknown as MastraClient;

    const result = await new MastraContentGenerator(mastra).generate(brief);

    expect(mastra.generateContentItem).toHaveBeenCalledWith(brief);
    expect(result).toMatchObject({
      type: 'linkedin',
      format: ContentFormat.MARKDOWN,
      model: 'openai/gpt-test',
    });
  });

  it('rejects malformed output so the queue can retry it', async () => {
    const mastra = {
      generateContentItem: jest.fn().mockResolvedValue({ type: 'linkedin' }),
    } as unknown as MastraClient;

    await expect(
      new MastraContentGenerator(mastra).generate(brief),
    ).rejects.toThrow('Mastra returned an invalid content draft');
  });
});
