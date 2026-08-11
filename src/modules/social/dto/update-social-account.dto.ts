import { IsBoolean } from 'class-validator';

export class UpdateSocialAccountDto {
  @IsBoolean()
  selected!: boolean;
}
