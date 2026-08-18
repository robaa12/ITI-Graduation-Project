import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import { AdminSocialConnectionsQueryDto } from './dto/admin-social-connections-query.dto';
import { AdminSocialAccountsQueryDto } from './dto/admin-social-accounts-query.dto';
import type {
  AdminSocialAccountDetail,
  AdminSocialAccountListItem,
  AdminSocialConnectionDetail,
  AdminSocialConnectionListItem,
} from './types/admin-social-accounts.types';

@Injectable()
export class AdminSocialAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listConnections(query: AdminSocialConnectionsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      provider,
      status,
      userId,
      search,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.SocialConnectionWhereInput = {};
    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (userId) where.userId = userId;
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.user = {
        OR: [
          { name: { contains: normalizedSearch, mode: 'insensitive' } },
          { email: { contains: normalizedSearch, mode: 'insensitive' } },
        ],
      };
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.SocialConnectionOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.socialConnection.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          provider: true,
          status: true,
          externalUserId: true,
          accessTokenExpiresAt: true,
          grantedScopes: true,
          lastSyncedAt: true,
          lastError: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { accounts: true } },
        },
      }),
      this.prisma.socialConnection.count({ where }),
    ]);

    return {
      data: items.map(
        ({ _count, ...connection }): AdminSocialConnectionListItem => ({
          ...connection,
          user: connection.user,
          accountCount: _count.accounts,
        }),
      ),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getConnection(id: string): Promise<AdminSocialConnectionDetail> {
    const connection = await this.prisma.socialConnection.findUnique({
      where: { id },
      select: {
        id: true,
        provider: true,
        status: true,
        externalUserId: true,
        accessTokenExpiresAt: true,
        grantedScopes: true,
        lastSyncedAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { accounts: true } },
      },
    });

    if (!connection) {
      throw new NotFoundException(`Social connection with ID ${id} not found`);
    }

    const platformGroups = await this.prisma.socialAccount.groupBy({
      by: ['platform'],
      where: { connectionId: id },
      _count: { _all: true },
    });

    const { _count, ...rest } = connection;
    return {
      ...rest,
      user: connection.user,
      accountCount: _count.accounts,
      accountsByPlatform: platformGroups.map((group) => ({
        platform: group.platform,
        count: group._count._all,
      })),
    };
  }

  async listAccounts(query: AdminSocialAccountsQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy,
      sortOrder,
      platform,
      available,
      selected,
      connectionId,
      userId,
      search,
      from,
      to,
    } = query;

    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Query parameter `from` must not be later than `to`',
      );
    }

    const where: Prisma.SocialAccountWhereInput = {};
    if (platform) where.platform = platform;
    if (available !== undefined) where.available = available === 'true';
    if (selected !== undefined) where.selected = selected === 'true';
    if (connectionId) where.connectionId = connectionId;
    if (userId) where.connection = { userId };
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { username: { contains: normalizedSearch, mode: 'insensitive' } },
      ];
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderBy: Prisma.SocialAccountOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder === 'DESC' ? 'desc' : 'asc' }
      : { createdAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.socialAccount.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          platform: true,
          externalId: true,
          name: true,
          username: true,
          imageUrl: true,
          tasks: true,
          selected: true,
          available: true,
          createdAt: true,
          updatedAt: true,
          connection: {
            select: { id: true, provider: true, status: true },
          },
          _count: { select: { publications: true } },
        },
      }),
      this.prisma.socialAccount.count({ where }),
    ]);

    return {
      data: items.map(({ _count, ...account }): AdminSocialAccountListItem => ({
        ...account,
        connection: account.connection,
        publicationCount: _count.publications,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAccount(id: string): Promise<AdminSocialAccountDetail> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id },
      select: {
        id: true,
        platform: true,
        externalId: true,
        name: true,
        username: true,
        imageUrl: true,
        tasks: true,
        selected: true,
        available: true,
        createdAt: true,
        updatedAt: true,
        connection: {
          select: {
            id: true,
            provider: true,
            status: true,
            externalUserId: true,
            lastSyncedAt: true,
            lastError: true,
          },
        },
        _count: { select: { publications: true } },
      },
    });

    if (!account) {
      throw new NotFoundException(`Social account with ID ${id} not found`);
    }

    const { _count, ...rest } = account;
    return {
      ...rest,
      connection: account.connection,
      publicationCount: _count.publications,
    };
  }
}
