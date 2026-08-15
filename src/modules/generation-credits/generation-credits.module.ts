import { Module } from '@nestjs/common';

import { GenerationCreditsService } from './generation-credits.service';

@Module({
  providers: [GenerationCreditsService],
  exports: [GenerationCreditsService],
})
export class GenerationCreditsModule {}
