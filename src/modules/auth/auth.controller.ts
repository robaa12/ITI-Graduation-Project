import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { validateSignInEmailDto, validateSignUpEmailDto } from './dto/email-auth.dto';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-up/email')
  @HttpCode(201)
  async signUpEmail(@Body() body: unknown, @Req() req: Request, @Res() res: Response): Promise<void> {
    validateSignUpEmailDto(body);

    await this.authService.handle(req, res);
  }

  @Post('sign-in/email')
  @HttpCode(200)
  async signInEmail(@Body() body: unknown, @Req() req: Request, @Res() res: Response): Promise<void> {
    validateSignInEmailDto(body);

    await this.authService.handle(req, res);
  }

  @Post('sign-out')
  @HttpCode(200)
  async signOut(@Req() req: Request, @Res() res: Response): Promise<void> {
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
  async verifyEmailOtp(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.authService.handle(req, res);
  }

  @Post('sign-in/email-otp')
  async signInEmailOtp(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.authService.handle(req, res);
  }
}
