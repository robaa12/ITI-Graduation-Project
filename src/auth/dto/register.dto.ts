import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/[!@#$%^&*(),.?":{}|<>]/, {
    message: 'password must contain at least one special character',
  })
  password: string;
}
