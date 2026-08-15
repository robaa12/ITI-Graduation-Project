import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { GenerationCreditsModule } from '../generation-credits/generation-credits.module';
import { MastraModule } from '../mastra/mastra.module';
import { ContentExportService } from './content-export.service';
import { ContentGenerationProcessor } from './content-generation.processor';
import { CONTENT_GENERATION_QUEUE } from './content-generation.queue';
import {
  CampaignContentController,
  ContentController,
} from './content.controller';
import { ContentService } from './content.service';
import { CONTENT_GENERATOR } from './generator/content-generator.port';
import { MastraContentGenerator } from './generator/mastra-content-generator';

@Module({
  imports: [
    AuthModule,
    CampaignsModule,
    GenerationCreditsModule,
    MastraModule,
    BullModule.registerQueue({ name: CONTENT_GENERATION_QUEUE }),
  ],
  controllers: [CampaignContentController, ContentController],
  providers: [
    ContentService,
    ContentExportService,
    ContentGenerationProcessor,
    { provide: CONTENT_GENERATOR, useClass: MastraContentGenerator },
  ],
  exports: [ContentService],
})
export class ContentModule {}
