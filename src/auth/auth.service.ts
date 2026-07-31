import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_SALT_ROUNDS = 10;

export interface JwtPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const password = await this.hashPassword(dto.password);
    const user = this.usersRepository.create({
      name: dto.name,
      email: dto.email,
      password,
    });
    const saved = await this.usersRepository.save(user);

    const accessToken = await this.generateAccessToken(saved);

    return {
      accessToken,
      user: this.toAuthenticatedUser(saved),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user),
      this.generateRefreshToken(user),
    ]);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.generateAccessToken(user);
    return { accessToken };
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return null;
    }

    return this.toAuthenticatedUser(user);
  }

  async findUserById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async getAuthenticatedUser(id: string): Promise<AuthenticatedUser> {
    const user = await this.findUserById(id);
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }
    return this.toAuthenticatedUser(user);
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  private async generateAccessToken(user: {
    id: string;
    email: string;
  }): Promise<string> {
    return this.jwtService.signAsync(this.buildPayload(user, 'access'));
  }

  private async generateRefreshToken(user: {
    id: string;
    email: string;
  }): Promise<string> {
    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES',
      '7d',
    ) as JwtSignOptions['expiresIn'];
    return this.jwtService.signAsync(this.buildPayload(user, 'refresh'), {
      expiresIn,
    });
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      const payload =
        await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private buildPayload(
    user: { id: string; email: string },
    type: JwtPayload['type'],
  ): JwtPayload {
    return { sub: user.id, email: user.email, type };
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }
}
