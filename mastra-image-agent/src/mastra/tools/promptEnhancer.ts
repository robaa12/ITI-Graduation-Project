import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ImageStyle, AspectRatio } from '../../shared/types.js';
import {
  STYLE_DESCRIPTIONS,
  STYLE_PROMPT_PREFIXES,
  ASPECT_RATIO_DIMENSIONS,
} from '../../shared/constants.js';

export const promptEnhancerTool = createTool({
  id: 'prompt-enhancer',
  description:
    'Enhances a raw user prompt into a detailed, high-quality image generation prompt. Adds artistic details about style, lighting, composition, color palette, mood, and technical quality to produce better image generation results.',
  inputSchema: z.object({
    prompt: z.string().min(3).max(1000).describe('The user\'s original text prompt describing what to generate'),
    style: z.nativeEnum(ImageStyle).default(ImageStyle.CINEMATIC).describe('The artistic style for the generated image'),
    aspectRatio: z.nativeEnum(AspectRatio).default(AspectRatio.LANDSCAPE).describe('The aspect ratio of the output image'),
  }),
  outputSchema: z.object({
    original: z.string(),
    enhanced: z.string(),
    style: z.nativeEnum(ImageStyle),
    styleDescription: z.string(),
    enhancements: z.array(z.string()),
    negativePrompt: z.string().optional(),
  }),
  execute: async ({ prompt, style, aspectRatio }) => {
    const stylePrefix = STYLE_PROMPT_PREFIXES[style as ImageStyle] || STYLE_PROMPT_PREFIXES[ImageStyle.CINEMATIC];
    const styleDesc = STYLE_DESCRIPTIONS[style as ImageStyle] || STYLE_DESCRIPTIONS[ImageStyle.CINEMATIC];
    const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio as AspectRatio] || ASPECT_RATIO_DIMENSIONS[AspectRatio.LANDSCAPE];

    const lightingTerms = [
      'volumetric lighting',
      'soft diffused lighting',
      'cinematic lighting',
      'dramatic atmospheric lighting',
      'golden hour illumination',
      'studio quality lighting',
    ];

    const qualityTerms = [
      '8K resolution',
      'highly detailed',
      'sharp focus',
      'intricate details',
      'masterpiece quality',
      'professional composition',
    ];

    const selectedLighting = lightingTerms[Math.floor(Math.random() * lightingTerms.length)];
    const selectedQuality1 = qualityTerms[Math.floor(Math.random() * qualityTerms.length)];
    const selectedQuality2 = qualityTerms[Math.floor(Math.random() * qualityTerms.length)];

    const colorTerms: Record<string, string[]> = {
      [ImageStyle.CINEMATIC]: ['rich warm tones', 'teal and orange grade', 'deep shadows', 'vibrant yet moody'],
      [ImageStyle.ANIME]: ['vibrant pastel palette', 'bright saturated colors', 'soft gradients'],
      [ImageStyle.PHOTOREALISTIC]: ['natural color palette', 'true-to-life tones', 'accurate skin tones'],
      [ImageStyle.FANTASY_ART]: ['ethereal glowing colors', 'rich magical hues', 'bioluminescent accents'],
      [ImageStyle.VAPORWAVE]: ['neon pink and cyan', 'sunset gradient palette', 'glitchy color shifts'],
    };

    const colors = colorTerms[style as string] || ['balanced color palette', 'harmonious composition'];
    const selectedColor = colors[Math.floor(Math.random() * colors.length)];

    const enhanced = `${stylePrefix} ${prompt}, ${styleDesc}, ${selectedColor}, ${selectedLighting}, ${selectedQuality1}, ${selectedQuality2}, ${dimensions} aspect ratio`;

    const enhancements = [
      `Applied "${style}" artistic style with matching composition rules`,
      `Added ${selectedLighting} for atmospheric depth`,
      `Enhanced with quality descriptors: ${selectedQuality1}, ${selectedQuality2}`,
      `Optimized for ${dimensions} aspect ratio`,
      `Applied color palette: ${selectedColor}`,
    ];

    const negativePrompts: Record<string, string> = {
      [ImageStyle.PHOTOREALISTIC]: 'cartoon, illustration, painting, distorted, low quality, blurry',
      [ImageStyle.ANIME]: 'photorealistic, 3d render, live action, low quality, distorted faces',
      [ImageStyle.CINEMATIC]: 'flat lighting, low contrast, oversaturated, low quality, blurry',
      [ImageStyle.OIL_PAINTING]: 'photograph, digital art, low resolution, messy strokes',
    };

    const negativePrompt = negativePrompts[style as string] || 'low quality, blurry, distorted, ugly, deformed';

    return {
      original: prompt,
      enhanced,
      style: style as ImageStyle,
      styleDescription: styleDesc,
      enhancements,
      negativePrompt,
    };
  },
});
