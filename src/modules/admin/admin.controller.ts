import {
  Controller,
  Get,
  Param,
  Body,
  Patch,
  Delete,
  UsePipes,
  UseGuards,
  Query,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { AdminSubscriptionsQueryDto } from './dto/admin-subscriptions-query.dto';
import { AdminPublicationsQueryDto } from './dto/admin-publications-query.dto';

function parsePage(value: unknown, fallback: number, max = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function parseBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  throw new BadRequestException(`${field} must be true or false`);
}

@Controller('admin')
@UseGuards(AdminGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ===== Step 1: User Management =====

  @Get('users')
  async getAdminUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getAdminUsers(query);
  }

  @Get('users/statistics')
  async getAdminUserStatistics() {
    return this.adminService.getAdminUserStatistics();
  }

  @Get('users/:id/analytics')
  async getAdminUserAnalytics(@Param('id') id: string) {
    return this.adminService.getAdminUserAnalytics(id);
  }

  @Get('users/:id')
  async getAdminUserById(@Param('id') id: string) {
    return this.adminService.getAdminUserById(id);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.adminService.updateUser(id, dto, currentUser.id);
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: ChangeUserRoleDto,
  ) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.adminService.deleteUser(id, currentUser.id);
  }

  // ===== Step 2: Resource Management =====

  // Generated Content
  @Get('generated-content')
  async getAdminGeneratedContent(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminGeneratedContent(page, limit, query.status, query.format, query.campaignId);
  }
  @Get('generated-content/:id') async getAdminGeneratedContentById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminGeneratedContentById(id); }

  // Knowledge Sources
  @Get('knowledge-sources')
  async getAdminKnowledgeSources(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminKnowledgeSources(page, limit, query.search, query.type, query.status, query.projectId);
  }
  @Get('knowledge-sources/:id') async getAdminKnowledgeSourceById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminKnowledgeSourceById(id); }

  // Social Connections
  @Get('social-connections')
  async getAdminSocialConnections(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminSocialConnections(page, limit, query.provider, query.status, query.userId);
  }
  @Get('social-connections/:id') async getAdminSocialConnectionById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminSocialConnectionById(id); }

  // Social Accounts
  @Get('social-accounts')
  async getAdminSocialAccounts(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminSocialAccounts(
      page,
      limit,
      query.platform,
      parseBoolean(query.available, 'available'),
      parseBoolean(query.selected, 'selected'),
      query.userId,
    );
  }
  @Get('social-accounts/:id') async getAdminSocialAccountById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminSocialAccountById(id); }

  // Social Publications (read-only)
  @Get('publications')
  async getAdminPublications(@Query() query: AdminPublicationsQueryDto) {
    return this.adminService.getAdminPublications(query);
  }

  @Get('publications/:id')
  async getAdminPublicationById(@Param('id') id: string) {
    return this.adminService.getAdminPublicationById(id);
  }

  // ===== Step 3: Subscription / Plan Management =====

  @Get('plans')
  async getAdminPlans(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminPlans(page, limit, parseBoolean(query.active, 'active'));
  }

  @Get('plans/:id') async getAdminPlanById(@Param('id') id: string, @CurrentUser() currentUser: {}) { return this.adminService.getAdminPlanById(id); }

  // Subscription Management (read-only)
  @Get('subscriptions')
  async getAdminSubscriptions(@Query() query: AdminSubscriptionsQueryDto) {
    return this.adminService.getAdminSubscriptions(query);
  }

  @Get('subscriptions/:id')
  async getAdminSubscriptionById(@Param('id') id: string) {
    return this.adminService.getAdminSubscriptionById(id);
  }

  // ===== Step 3: Revenue Analytics =====

  @Get('dashboard/revenue')
  async getAdminRevenueOverview(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminRevenueOverview(page, limit);
  }

  @Get('dashboard/revenue/users')
  async getAdminRevenuePerUser(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminRevenuePerUser(page, limit, query.userId);
  }

  @Get('dashboard/revenue/plans')
  async getAdminRevenuePerPlan(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminRevenuePerPlan(page, limit, query.planId);
  }

  // ===== Step 3: Generation Credit Events =====

  @Get('credit-events')
  async getAdminCreditEvents(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminCreditEvents(page, limit, query.userId, query.kind, parseBoolean(query.refunded, 'refunded'), query.startDate, query.endDate);
  }

  @Get('users/:id/credit-events')
  async getAdminUserCreditEvents(@Param('id') id: string, @Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminUserCreditEvents(page, limit, id, query.kind, parseBoolean(query.refunded, 'refunded'), query.startDate, query.endDate);
  }

  // ===== Step 3: Workflow Executions =====

  @Get('workflow-executions')
  async getAdminWorkflowExecutions(@Query() query: any, @CurrentUser() currentUser: {}) {
    const page = parsePage(query.page, 1);
    const limit = parsePage(query.limit, 20);
    return this.adminService.getAdminWorkflowExecutions(page, limit, query.userId, query.kind, query.status, query.accountingStatus, query.startDate, query.endDate);
  }

  @Get('workflow-executions/:id')
  async getAdminWorkflowExecutionById(@Param('id') id: string, @Query() query: any, @CurrentUser() currentUser: {}) {
    const sanitize = query.sanitize !== 'false';
    return this.adminService.getAdminWorkflowExecutionById(id, sanitize);
  }
}
