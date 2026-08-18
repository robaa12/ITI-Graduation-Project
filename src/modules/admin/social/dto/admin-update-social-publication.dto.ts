import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin-editable publication field. Only the caption may be edited, and only
 * for pre-publish (QUEUED/SCHEDULED) or FAILED records — the queue worker reads
 * the caption from the row at publish time, so an edit is picked up. All other
 * fields (status, scheduling, platform, external ids, revision) are
 * system-managed and never writable.
 */
export class AdminUpdateSocialPublicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_200)
  caption!: string;
}
