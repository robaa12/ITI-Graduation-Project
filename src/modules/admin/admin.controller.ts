import {
  Controller,
  Get,
  Param,
  Body,
  Patch,
  Delete,
  Post,
  UsePipes,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ===== Step 1: User Management =====

  @Get('users')
  async getAdminUsers(@Query() query: any = {}, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminUsers(page, limit, query.search, query.status);
  }

  @Get('users/:id') async getAdminUserById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminUserById(id); }
  @Patch('users/:id/status') async updateUserStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() currentUser: {}) { return this.adminService.updateUserStatus(id, body.status); }
  @Patch('users/:id/role') async updateUserRole(@Param('id') id: string, @Body() body: any, @CurrentUser() currentUser: {}) { return this.adminService.updateUserRole(id, body.role); }
  @Delete('users/:id') async deleteUser(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.deleteUser(id); }

  // ===== Step 2: Resource Management =====

  // Project Management
  @Get('projects')
  async getAdminProjects(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminProjects(page, limit, query.search, query.status);
  }
  @Get('projects/:id') async getAdminProjectById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminProjectById(id); }
  @Patch('projects/:id/status') async updateAdminProjectStatus(@Param('id') id: string, @Body('status') status: 'ACTIVE' | 'ARCHIVED', @CurrentUser() currentUser: {}) { return this.adminService.updateAdminProjectStatus(id, status); }
  @Delete('projects/:id') async deleteAdminProject(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.deleteAdminProject(id); }

  // Campaign Management
  @Get('campaigns')
  async getAdminCampaigns(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminCampaigns(page, limit, query.search, query.status, query.projectId);
  }
  @Get('campaigns/:id') async getAdminCampaignById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminCampaignById(id); }

  // Strategy Management
  @Get('strategies')
  async getAdminStrategies(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminStrategies(page, limit, query.status, query.approvalStatus, query.campaignId);
  }
  @Get('strategies/:id') async getAdminStrategyById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminStrategyById(id); }
  @Patch('strategies/:id/review') async adminReviewStrategy(@Param('id') id: string, @Body() body: any, @CurrentUser() currentUser: {}) { return this.adminService.adminReviewStrategy(id, body.action, body.note); }

  // Generated Content
  @Get('generated-content')
  async getAdminGeneratedContent(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminGeneratedContent(page, limit, query.status, query.format, query.campaignId);
  }
  @Get('generated-content/:id') async getAdminGeneratedContentById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminGeneratedContentById(id); }

  // Knowledge Sources
  @Get('knowledge-sources')
  async getAdminKnowledgeSources(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminKnowledgeSources(page, limit, query.search, query.type, query.status, query.projectId);
  }
  @Get('knowledge-sources/:id') async getAdminKnowledgeSourceById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminKnowledgeSourceById(id); }

  // Social Connections
  @Get('social-connections')
  async getAdminSocialConnections(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminSocialConnections(page, limit, query.provider, query.status, query.userId);
  }
  @Get('social-connections/:id') async getAdminSocialConnectionById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminSocialConnectionById(id); }

  // Social Accounts
  @Get('social-accounts')
  async getAdminSocialAccounts(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminSocialAccounts(page, limit, query.platform, query.available, query.selected, query.userId);
  }
  @Get('social-accounts/:id') async getAdminSocialAccountById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminSocialAccountById(id); }

  // ===== Step 3: Subscription / Plan Management =====

  @Get('plans')
  async getAdminPlans(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminPlans(page, limit, query.active);
  }

  @Get('plans/:id') async getAdminPlanById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminPlanById(id); }

  // ===== Step 3: Revenue Analytics =====

  @Get('dashboard/revenue')
  async getAdminRevenueOverview(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminRevenueOverview(page, limit);
  }

  @Get('dashboard/revenue/users')
  async getAdminRevenuePerUser(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminRevenuePerUser(page, limit, query.userId);
  }

  @Get('dashboard/revenue/plans')
  async getAdminRevenuePerPlan(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminRevenuePerPlan(page, limit, query.planId);
  }

  // ===== Step 3: Generation Credit Events =====

  @Get('credit-events')
  async getAdminCreditEvents(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminCreditEvents(page, limit, query.userId, query.kind, query.refunded, query.startDate, query.endDate);
  }

  @Get('users/:id/credit-events')
  async getAdminUserCreditEvents(@Param('id') id: string, @Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminUserCreditEvents(page, limit, id, query.kind, query.refunded, query.startDate, query.endDate);
  }

  // ===== Step 3: Workflow Executions =====

  @Get('workflow-executions')
  async getAdminWorkflowExecutions(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminWorkflowExecutions(page, limit, query.userId, query.kind, query.status, query.accountingStatus, query.startDate, query.endDate);
  }

  @Get('workflow-executions/:id')
  async getAdminWorkflowExecutionById(@Param('id') id: string, @Query() query: any, @CurrentUser() currentUser: {}) {
    const sanitize = query.sanitize !== 'false';
    return this.adminService.getAdminWorkflowExecutionById(id, sanitize);
  }

  // ===== Step 3: Email Management =====

  @Get('emails')
  async getAdminEmails(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    return this.adminService.getAdminEmails(page, limit, query.status, query.userId, query.startDate, query.endDate);
  }

  @Get('emails/:id')
  async getAdminEmailById(@Param('id') id: string, @Query() query: any, @CurrentUser() currentUser: {}) {
    return this.adminService.getAdminEmailById(id);
  }

  @Post('emails/:id/cancel')
  async cancelAdminEmail(@Param('id') id: string, @Query() query: any, @CurrentUser() currentUser: {}) {
    return this.adminService.cancelAdminEmail(id, query.force);
  }

  @Post('emails/:id/retry')
  async retryAdminEmail(@Param('id') id: string, @Query() query: any, @CurrentUser() currentUser: {}) {
    return this.adminService.retryAdminEmail(id);
  }
}
