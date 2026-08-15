import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class AdminUsersService {
  async findAll(query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;

    const users = [
      {
        id: '1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'USER',
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const total = 1;

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    return {
      id,
      name: 'Test',
      email: 'test@example.com',
      role: 'USER',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async update(id: string, dto: { name?: string; image?: string }) {
    return {
      id,
      name: dto.name || 'Test',
      email: 'test@example.com',
      role: 'USER',
      emailVerified: true,
      image: dto.image || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async changeRole(id: string, dto: { role: string }) {
    const validRoles = ['USER', 'ADMIN'];
    if (!validRoles.includes(dto.role)) {
      throw new Error(`Invalid role: ${dto.role}. Must be USER or ADMIN`);
    }

    return {
      id,
      name: 'Test',
      email: 'test@example.com',
      role: dto.role,
    };
  }
}
