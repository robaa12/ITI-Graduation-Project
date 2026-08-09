import { Module } from '@nestjs/common';

import { MastraClient } from './mastra.client';
import { MastraRunEventsService } from './run-events.service';

/**
 * Access to the external Mastra service. Exported so the strategy and content
 * workflow modules share one client rather than each building their own.
 */
@Module({
  providers: [MastraClient, MastraRunEventsService],
  exports: [MastraClient, MastraRunEventsService],
})
export class MastraModule {}
