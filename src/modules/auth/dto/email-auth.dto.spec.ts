import {
  validateSignInEmailDto,
  validateSignUpEmailDto,
} from './email-auth.dto';

describe('email auth DTO validation', () => {
  it('normalizes signup identity fields before Better Auth receives them', () => {
    const dto = validateSignUpEmailDto({
      name: '  Alex Rivera  ',
      email: '  Alex@Example.COM  ',
      password: 'password123',
    });

    expect(dto.name).toBe('Alex Rivera');
    expect(dto.email).toBe('alex@example.com');
  });

  it('normalizes signin emails', () => {
    const dto = validateSignInEmailDto({
      email: '  Alex@Example.COM  ',
      password: 'password123',
    });

    expect(dto.email).toBe('alex@example.com');
  });
});
