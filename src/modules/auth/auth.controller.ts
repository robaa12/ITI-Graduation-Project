import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  validateChangePasswordDto,
  validatePasswordResetOtpCheckDto,
  validatePasswordResetRequestDto,
  validatePasswordResetWithOtpDto,
  validateSignInEmailDto,
  validateSignUpEmailDto,
  validateUpdateUserDto,
} from './dto/email-auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('sign-up/email')
  @HttpCode(201)
  async signUpEmail(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const dto = validateSignUpEmailDto(body);

    if (await this.authService.isEmailRegistered(dto.email)) {
      throw new UnprocessableEntityException({
        code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
        message: 'The email already exists.',
      });
    }

    req.body = dto;
    await this.authService.handle(req, res);
  }

  @Post('sign-in/email')
  @HttpCode(200)
  async signInEmail(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const dto = validateSignInEmailDto(body);

    req.body = dto;
    await this.authService.handle(req, res);
  }

  @Post('sign-out')
  @HttpCode(200)
  async signOut(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.authService.handle(req, res);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    req.body = validateChangePasswordDto(body);
    await this.authService.handle(req, res);
  }

  @Post('update-user')
  @HttpCode(200)
  async updateUser(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    req.body = validateUpdateUserDto(body);
    await this.authService.handle(req, res);
  }

  @Get('session')
  async getSession(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.authService.handle(req, res, '/api/auth/get-session');
  }

  @Post('email-otp/send-verification-otp')
  async sendVerificationOtp(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.authService.handle(req, res);
  }

  @Post('email-otp/verify-email')
  async verifyEmailOtp(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.authService.handle(req, res);
  }

  @Post('email-otp/request-password-reset')
  @HttpCode(200)
  async requestPasswordResetOtp(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    req.body = validatePasswordResetRequestDto(body);
    await this.authService.handle(req, res);
  }

  @Post('email-otp/check-verification-otp')
  @HttpCode(200)
  async checkPasswordResetOtp(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    req.body = validatePasswordResetOtpCheckDto(body);
    await this.authService.handle(req, res);
  }

  @Post('email-otp/reset-password')
  @HttpCode(200)
  async resetPasswordWithOtp(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    req.body = validatePasswordResetWithOtpDto(body);
    await this.authService.handle(req, res);
  }

  @Post('sign-in/email-otp')
  async signInEmailOtp(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.authService.handle(req, res);
  }
}
