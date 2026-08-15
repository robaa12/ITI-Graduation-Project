import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  it('creates one initial chat with a new project', async () => {
    const initialChat = { id: 'chat-1', name: 'New chat' };
    const create = jest.fn().mockResolvedValue({
      id: 'project-1',
      name: 'Launch plan',
      campaigns: [initialChat],
    });
    const service = new ProjectsService({
      project: { create },
    } as unknown as PrismaService);

    await expect(
      service.create('user-1', { name: 'Launch plan' }),
    ).resolves.toEqual({
      id: 'project-1',
      name: 'Launch plan',
      initialChat,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Launch plan',
        description: undefined,
        userId: 'user-1',
        campaigns: { create: { name: 'New chat' } },
      },
      include: { campaigns: true },
    });
  });
});
