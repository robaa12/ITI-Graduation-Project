import { BadRequestException } from '@nestjs/common';

export interface SignUpEmailDto {
  name: string;
  email: string;
  password: string;
  image?: string;
  callbackURL?: string;
  rememberMe?: boolean;
}

export interface SignInEmailDto {
  email: string;
  password: string;
  callbackURL?: string;
  rememberMe?: boolean;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}

export interface UpdateUserDto {
  name: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignUpEmailDto(body: unknown): SignUpEmailDto {
  const dto = assertObject(body);

  assertString(dto.name, 'name');
  assertEmail(dto.email);
  assertPassword(dto.password);
  assertOptionalString(dto.image, 'image');
  assertOptionalString(dto.callbackURL, 'callbackURL');
  assertOptionalBoolean(dto.rememberMe, 'rememberMe');

  return {
    ...dto,
    name: dto.name.trim(),
    email: dto.email.trim().toLowerCase(),
  } as SignUpEmailDto;
}

export function validateSignInEmailDto(body: unknown): SignInEmailDto {
  const dto = assertObject(body);

  assertEmail(dto.email);
  assertPassword(dto.password);
  assertOptionalString(dto.callbackURL, 'callbackURL');
  assertOptionalBoolean(dto.rememberMe, 'rememberMe');

  return {
    ...dto,
    email: dto.email.trim().toLowerCase(),
  } as SignInEmailDto;
}

export function validateChangePasswordDto(body: unknown): ChangePasswordDto {
  const dto = assertObject(body);

  assertPassword(dto.currentPassword, 'currentPassword');
  assertPassword(dto.newPassword, 'newPassword');
  assertOptionalBoolean(dto.revokeOtherSessions, 'revokeOtherSessions');

  if (dto.currentPassword === dto.newPassword) {
    throw new BadRequestException(
      'newPassword must be different from currentPassword',
    );
  }

  return {
    currentPassword: dto.currentPassword,
    newPassword: dto.newPassword,
    ...(dto.revokeOtherSessions === undefined
      ? {}
      : { revokeOtherSessions: dto.revokeOtherSessions }),
  };
}

export function validateUpdateUserDto(body: unknown): UpdateUserDto {
  const dto = assertObject(body);

  assertString(dto.name, 'name');
  const name = dto.name.trim();
  if (name.length > 100) {
    throw new BadRequestException('name must be at most 100 characters');
  }

  return { name };
}

function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Request body must be a JSON object');
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
}

function assertEmail(value: unknown): asserts value is string {
  assertString(value, 'email');

  if (!emailPattern.test(value.trim())) {
    throw new BadRequestException('email must be a valid email address');
  }
}

function assertPassword(
  value: unknown,
  field = 'password',
): asserts value is string {
  assertString(value, field);

  if (value.length < 8) {
    throw new BadRequestException(`${field} must be at least 8 characters`);
  }

  if (value.length > 128) {
    throw new BadRequestException(`${field} must be at most 128 characters`);
  }
}

function assertOptionalString(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
}

function assertOptionalBoolean(
  value: unknown,
  field: string,
): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }
}
