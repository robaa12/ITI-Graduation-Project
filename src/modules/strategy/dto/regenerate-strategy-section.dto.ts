import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const STRATEGY_REVISION_SECTIONS = [
  'personas',
  'buyerJourney',
  'smartObjectives',
] as const;

export type StrategyRevisionSection =
  (typeof STRATEGY_REVISION_SECTIONS)[number];

export class RegenerateStrategySectionDto {
  @IsIn(STRATEGY_REVISION_SECTIONS)
  section!: StrategyRevisionSection;

  @IsString()
  @MinLength(3)
  @MaxLength(4_000)
  feedback!: string;
}
