import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContentExportService } from './content-export.service';
import { ContentGenerationProcessor } from './content-generation.processor';
import { CONTENT_GENERATION_QUEUE } from './content-generation.queue';
import {
  CampaignContentController,
  ContentController,
} from './content.controller';
import { ContentService } from './content.service';
import { CONTENT_GENERATOR } from './generator/content-generator.port';
import { PlaceholderContentGenerator } from './generator/placeholder-content-generator';

@Module({
  imports: [
    AuthModule,
    CampaignsModule,
    BullModule.registerQueue({ name: CONTENT_GENERATION_QUEUE }),
  ],
  controllers: [CampaignContentController, ContentController],
  providers: [
    ContentService,
    ContentExportService,
    ContentGenerationProcessor,
    // Swap this class for the real agent client once it is available.
    // It only has to implement ContentGeneratorPort.
    { provide: CONTENT_GENERATOR, useClass: PlaceholderContentGenerator },
  ],
  exports: [ContentService],
})
export class ContentModule {}
