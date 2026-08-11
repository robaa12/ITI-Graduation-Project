import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MetaClient } from './meta.client';
import { MetaConnectorsController } from './meta-connectors.controller';
import { MetaConnectorsService } from './meta-connectors.service';
import { SOCIAL_PUBLICATION_QUEUE } from './social-publication.queue';
import { SocialPublicationProcessor } from './social-publication.processor';
import { SocialPublicationsController } from './social-publications.controller';
import { SocialPublicationsService } from './social-publications.service';
import { TokenCipherService } from './token-cipher.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: SOCIAL_PUBLICATION_QUEUE }),
  ],
  controllers: [MetaConnectorsController, SocialPublicationsController],
  providers: [
    MetaClient,
    TokenCipherService,
    MetaConnectorsService,
    SocialPublicationsService,
    SocialPublicationProcessor,
  ],
})
export class SocialModule {}
