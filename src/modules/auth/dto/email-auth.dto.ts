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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignUpEmailDto(body: unknown): SignUpEmailDto {
  const dto = assertObject(body);

  assertString(dto.name, 'name');
  assertEmail(dto.email);
  assertPassword(dto.password);
  assertOptionalString(dto.image, 'image');
  assertOptionalString(dto.callbackURL, 'callbackURL');
  assertOptionalBoolean(dto.rememberMe, 'rememberMe');

  return dto as unknown as SignUpEmailDto;
}

export function validateSignInEmailDto(body: unknown): SignInEmailDto {
  const dto = assertObject(body);

  assertEmail(dto.email);
  assertPassword(dto.password);
  assertOptionalString(dto.callbackURL, 'callbackURL');
  assertOptionalBoolean(dto.rememberMe, 'rememberMe');

  return dto as unknown as SignInEmailDto;
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

  if (!emailPattern.test(value)) {
    throw new BadRequestException('email must be a valid email address');
  }
}

function assertPassword(value: unknown): asserts value is string {
  assertString(value, 'password');

  if (value.length < 8) {
    throw new BadRequestException('password must be at least 8 characters');
  }

  if (value.length > 128) {
    throw new BadRequestException('password must be at most 128 characters');
  }
}

function assertOptionalString(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
}

function assertOptionalBoolean(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }
}
