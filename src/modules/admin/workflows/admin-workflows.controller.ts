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
import { AdminWorkflowsService } from './admin-workflows.service';
import { AdminWorkflowExecutionsQueryDto } from './dto/admin-workflow-executions-query.dto';

@Controller('admin/workflows')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminWorkflowsController {
  constructor(private readonly adminWorkflows: AdminWorkflowsService) {}

  @Get('executions')
  list(@Query() query: AdminWorkflowExecutionsQueryDto) {
    return this.adminWorkflows.listExecutions(query);
  }

  @Get('executions/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminWorkflows.getExecution(id);
  }

  @Get('executions/:id/agents')
  agents(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminWorkflows.getExecutionAgents(id);
  }

  @Get('statistics')
  statistics() {
    return this.adminWorkflows.getStatistics();
  }
}
