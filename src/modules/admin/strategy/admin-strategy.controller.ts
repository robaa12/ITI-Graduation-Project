import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin.guard';
import { AdminStrategyService } from './admin-strategy.service';
import { AdminStrategyQueryDto } from './dto/admin-strategy-query.dto';

@Controller('admin/strategies')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminStrategyController {
  constructor(private readonly adminStrategy: AdminStrategyService) {}

  @Get()
  list(@Query() query: AdminStrategyQueryDto) {
    return this.adminStrategy.listStrategies(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminStrategy.getStrategy(id);
  }

  @Get(':id/reviews')
  reviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminStrategy.listStrategyReviews(id);
  }
}
