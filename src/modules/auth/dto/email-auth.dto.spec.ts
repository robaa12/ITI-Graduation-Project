import {
  validateChangePasswordDto,
  validateSignInEmailDto,
  validateSignUpEmailDto,
  validateUpdateUserDto,
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

  it('validates password changes and preserves the session preference', () => {
    expect(
      validateChangePasswordDto({
        currentPassword: 'password123',
        newPassword: 'new-password456',
        revokeOtherSessions: true,
      }),
    ).toEqual({
      currentPassword: 'password123',
      newPassword: 'new-password456',
      revokeOtherSessions: true,
    });
  });

  it('rejects reusing the current password', () => {
    expect(() =>
      validateChangePasswordDto({
        currentPassword: 'password123',
        newPassword: 'password123',
      }),
    ).toThrow('newPassword must be different from currentPassword');
  });

  it('normalizes profile names', () => {
    expect(validateUpdateUserDto({ name: '  Alex Rivera  ' })).toEqual({
      name: 'Alex Rivera',
    });
  });
});
