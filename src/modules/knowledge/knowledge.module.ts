import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MastraModule } from '../mastra/mastra.module';
import { ProjectsModule } from '../projects/projects.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeProcessor } from './knowledge.processor';
import { KNOWLEDGE_QUEUE } from './knowledge.queue';
import { KnowledgeService } from './knowledge.service';
import { WebsiteCrawlerService } from './website-crawler.service';

@Module({
  imports: [AuthModule, ProjectsModule, MastraModule, BullModule.registerQueue({ name: KNOWLEDGE_QUEUE })],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeProcessor, WebsiteCrawlerService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
