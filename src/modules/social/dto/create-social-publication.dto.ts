import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateSocialPublicationDto {
  @IsUUID()
  socialAccountId!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  scheduledFor?: string;
}
