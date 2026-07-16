import { z } from 'zod';
import { ImageStyle, AspectRatio, ImageQuality } from './types.js';

const styleValues = Object.values(ImageStyle) as [string, ...string[]];
const aspectRatioValues = Object.values(AspectRatio) as [string, ...string[]];
const qualityValues = Object.values(ImageQuality) as [string, ...string[]];

export const ImageStyleSchema = z.enum(styleValues as [ImageStyle, ...ImageStyle[]]);
export const AspectRatioSchema = z.enum(aspectRatioValues as [AspectRatio, ...AspectRatio[]]);
export const ImageQualitySchema = z.enum(qualityValues as [ImageQuality, ...ImageQuality[]]);

export const ImageGenerationInputSchema = z.object({
  prompt: z.string().min(3, 'Prompt must be at least 3 characters').max(1000),
  style: ImageStyleSchema.default(ImageStyle.CINEMATIC),
  aspectRatio: AspectRatioSchema.default(AspectRatio.LANDSCAPE),
  quality: ImageQualitySchema.default(ImageQuality.STANDARD),
  negativePrompt: z.string().max(500).optional(),
  seed: z.number().int().positive().optional(),
});

export type ImageGenerationInput = z.infer<typeof ImageGenerationInputSchema>;
