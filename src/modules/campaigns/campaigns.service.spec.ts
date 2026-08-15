import type { Campaign } from '@prisma/client';

import type { PrismaService } from '../../prisma/prisma.service';
import type { MastraClient } from '../mastra/mastra.client';
import type { ProjectsService } from '../projects/projects.service';
import { CampaignsService } from './campaigns.service';
import type { GenerateCampaignTitleDto } from './dto/generate-campaign-title.dto';

const brief: GenerateCampaignTitleDto = {
  brandName: 'Ember Goods',
  product: 'A smart mug that keeps coffee at the perfect temperature',
  industry: 'Consumer technology',
  businessType: 'Direct to consumer',
  campaignGoal: 'launch',
  targetAudience: 'Busy creative professionals',
};

function campaign(name: string): Campaign {
  return {
    id: 'campaign-1',
    projectId: 'project-1',
    name,
    description: null,
    objective: null,
    audience: null,
    tone: null,
    channels: [],
    startDate: null,
    endDate: null,
    status: 'DRAFT',
    publishedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('CampaignsService.generateTitle', () => {
  function setup(currentName = 'New chat') {
    const current = campaign(currentName);
    const prisma = {
      campaign: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) =>
            Promise.resolve({ ...current, id: where.id }),
          ),
      },
    };
    const mastra = {
      generateChatTitle: jest
        .fn()
        .mockResolvedValue({ title: 'Ember Smart Mug Launch' }),
    };
    const service = new CampaignsService(
      prisma as unknown as PrismaService,
      {} as ProjectsService,
      mastra as unknown as MastraClient,
    );
    return { mastra, prisma, service };
  }

  it('persists a generated 4-word title', async () => {
    const { prisma, service } = setup();

    await service.generateTitle('user-1', 'campaign-1', brief);

    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-1', name: 'New chat' },
      data: { name: 'Ember Smart Mug Launch' },
    });
  });

  it('does not replace a manually named chat', async () => {
    const { mastra, prisma, service } = setup('My Custom Campaign Name');

    const result = await service.generateTitle('user-1', 'campaign-1', brief);

    expect(result.name).toBe('My Custom Campaign Name');
    expect(mastra.generateChatTitle).not.toHaveBeenCalled();
    expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('uses a valid fallback when the agent is unavailable', async () => {
    const { mastra, prisma, service } = setup();
    mastra.generateChatTitle.mockRejectedValueOnce(new Error('offline'));

    await service.generateTitle('user-1', 'campaign-1', brief);

    const title = prisma.campaign.updateMany.mock.calls[0][0].data.name;
    expect(title.trim().split(/\s+/u)).toHaveLength(5);
  });
});
