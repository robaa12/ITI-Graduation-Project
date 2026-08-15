import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  SocialConnectionStatus,
  SocialPlatform,
  SocialPublicationStatus,
} from '@prisma/client';
import { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { MetaApiError, MetaClient } from './meta.client';
import {
  SOCIAL_PUBLICATION_QUEUE,
  SocialPublicationJob,
} from './social-publication.queue';
import { TokenCipherService } from './token-cipher.service';

@Processor(SOCIAL_PUBLICATION_QUEUE)
export class SocialPublicationProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialPublicationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaClient,
    private readonly cipher: TokenCipherService,
  ) {
    super();
  }

  async process(job: Job<SocialPublicationJob>): Promise<void> {
    const { publicationId, revision } = job.data;
    const publication = await this.prisma.socialPublication.findUnique({
      where: { id: publicationId },
      include: { socialAccount: { include: { connection: true } } },
    });
    if (!publication || publication.revision !== revision) return;
    if (
      publication.status !== SocialPublicationStatus.QUEUED &&
      publication.status !== SocialPublicationStatus.SCHEDULED
    ) {
      return;
    }

    const account = publication.socialAccount;
    if (!account) {
      throw new Error('The Meta account was disconnected before publishing');
    }
    if (
      !account.selected ||
      !account.available ||
      account.connection.status !== SocialConnectionStatus.ACTIVE
    ) {
      throw new Error('The selected Meta account is no longer active');
    }

    const claim = await this.prisma.socialPublication.updateMany({
      where: {
        id: publicationId,
        revision,
        status: {
          in: [
            SocialPublicationStatus.QUEUED,
            SocialPublicationStatus.SCHEDULED,
          ],
        },
      },
      data: { status: SocialPublicationStatus.PUBLISHING, error: null },
    });
    if (!claim.count) return;

    const accessToken = this.cipher.decrypt(account.accessTokenCiphertext);
    try {
      const externalPostId =
        account.platform === SocialPlatform.FACEBOOK
          ? await this.meta.publishFacebook({
              pageId: account.externalId,
              accessToken,
              caption: publication.caption,
              mediaUrl: publication.mediaUrl,
            })
          : await this.meta.publishInstagram({
              accountId: account.externalId,
              accessToken,
              caption: publication.caption,
              mediaUrl: publication.mediaUrl!,
            });

      await this.prisma.socialPublication.updateMany({
        where: {
          id: publicationId,
          revision,
          status: SocialPublicationStatus.PUBLISHING,
        },
        data: {
          status: SocialPublicationStatus.PUBLISHED,
          externalPostId,
          publishedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      if (error instanceof MetaApiError && error.code === 190) {
        await this.prisma.socialConnection.updateMany({
          where: { id: account.connectionId },
          data: {
            status: SocialConnectionStatus.EXPIRED,
            lastError: safeErrorMessage(error),
          },
        });
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<SocialPublicationJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const { publicationId, revision } = job.data;
    const message = safeErrorMessage(error);
    this.logger.error(
      `Meta publication ${publicationId} failed: ${message}`,
      error.stack,
    );
    await this.prisma.socialPublication.updateMany({
      where: {
        id: publicationId,
        revision,
        status: {
          in: [
            SocialPublicationStatus.QUEUED,
            SocialPublicationStatus.SCHEDULED,
            SocialPublicationStatus.PUBLISHING,
          ],
        },
      },
      data: { status: SocialPublicationStatus.FAILED, error: message },
    });
  }
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    1_000,
  );
}
