import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MastraModule } from '../mastra/mastra.module';
import { ProjectsModule } from '../projects/projects.module';
import {
  CampaignsController,
  ProjectCampaignsController,
} from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [AuthModule, ProjectsModule, MastraModule],
  controllers: [ProjectCampaignsController, CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
