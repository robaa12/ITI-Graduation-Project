import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('SMTP_HOST'),
      port: this.configService.getOrThrow<number>('SMTP_PORT'),
      secure: this.configService.get<number>('SMTP_PORT') === 465,
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: this.configService.getOrThrow<string>('SMTP_PASSWORD'),
      },
    });
  }

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const from = this.configService.getOrThrow<string>('SMTP_FROM_EMAIL');

    await this.transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    this.logger.log(`Email sent to ${options.to}`);
  }
}
