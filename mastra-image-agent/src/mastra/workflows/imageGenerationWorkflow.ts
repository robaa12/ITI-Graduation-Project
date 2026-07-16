import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { ImageStyle, AspectRatio, ImageQuality, ImageSpecs } from '../../shared/types.js';
import {
  STYLE_DESCRIPTIONS,
  STYLE_PROMPT_PREFIXES,
  ASPECT_RATIO_DIMENSIONS,
} from '../../shared/constants.js';
import { ImageStyleSchema, AspectRatioSchema, ImageQualitySchema } from '../../shared/schemas.js';

const WorkflowInputSchema = z.object({
  prompt: z.string().min(3, 'Prompt must be at least 3 characters').max(1000),
  style: ImageStyleSchema.default(ImageStyle.CINEMATIC),
  aspectRatio: AspectRatioSchema.default(AspectRatio.LANDSCAPE),
  quality: ImageQualitySchema.default(ImageQuality.STANDARD),
  negativePrompt: z.string().max(500).optional(),
  seed: z.number().int().positive().optional(),
  provider: z.string().default('demo'),
});

const ConfigSchema = z.object({
  quality: ImageQualitySchema,
  negativePrompt: z.string().optional(),
  seed: z.number().int().positive().optional(),
  provider: z.string(),
});

const COMPOSITION_TYPES = [
  'Rule of thirds with the subject offset to the right, leading lines drawing the eye through the frame',
  'Centered composition with symmetrical balance, creating a sense of stability and formality',
  'Diagonal composition with dynamic angles, creating tension and movement throughout the frame',
  'Framed composition using foreground elements to create depth and context around the main subject',
  'Golden spiral composition with the focal point at the natural intersection of the spiral curve',
  'Minimalist composition with generous negative space emphasizing the singular subject',
];

const MOODS: Record<string, string[]> = {
  [ImageStyle.CINEMATIC]: ['Epic and dramatic', 'Moody and atmospheric', 'Intense and gripping', 'Melancholic and reflective'],
  [ImageStyle.ANIME]: ['Whimsical and dreamy', 'Energetic and vibrant', 'Peaceful and serene', 'Bittersweet and nostalgic'],
  [ImageStyle.PHOTOREALISTIC]: ['Natural and grounded', 'Awe-inspiring and grand', 'Intimate and personal', 'Timeless and classic'],
  [ImageStyle.FANTASY_ART]: ['Magical and enchanting', 'Mysterious and ancient', 'Heroic and triumphant', 'Ethereal and otherworldly'],
  [ImageStyle.MINIMALIST]: ['Calm and meditative', 'Clean and precise', 'Serene and balanced', 'Quiet and contemplative'],
};

const CAMERA_ANGLES: Record<string, string[]> = {
  [ImageStyle.CINEMATIC]: ['Low angle wide shot', 'Dutch angle close-up', 'Eye-level tracking shot', 'Over-the-shoulder medium shot'],
  [ImageStyle.ANIME]: ['Dynamic low angle', 'Establishing long shot', 'Close-up with bokeh background', 'Bird\'s eye view'],
  [ImageStyle.PHOTOREALISTIC]: ['50mm portrait perspective', 'Wide-angle environmental', 'Macro detail shot', 'Telephoto compressed view'],
  [ImageStyle.FANTASY_ART]: ['Heroic low angle looking up', 'Panoramic establishing shot', 'Dramatic worm\'s eye view', 'Aerial battle perspective'],
};

const LIGHTING_SETUPS: Record<string, string[]> = {
  [ImageStyle.CINEMATIC]: ['Three-point dramatic lighting with a warm key light and cool fill', 'Golden hour backlight creating a rim light effect', 'Moody low-key lighting with deep shadows and selective highlights'],
  [ImageStyle.ANIME]: ['Soft diffused lighting with pastel-colored bounce light', 'Dramatic sunset side-lighting with long shadows', 'Glowing magical light source illuminating from below'],
  [ImageStyle.PHOTOREALISTIC]: ['Natural window light diffused through sheer curtains', 'Studio softbox lighting with fill reflectors', 'Open shade with a blue sky fill on an overcast day'],
  [ImageStyle.FANTASY_ART]: ['Bioluminescent glow lighting from magical elements', 'Dramatic god rays piercing through atmospheric haze', 'Multi-colored magical light sources with ambient glow'],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateMockSpecs(prompt: string, style: ImageStyle, aspectRatio: AspectRatio): ImageSpecs {
  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio];

  const styleMoods = MOODS[style] || ['Balanced and harmonious'];
  const styleAngles = CAMERA_ANGLES[style] || ['Standard eye-level shot'];
  const styleLighting = LIGHTING_SETUPS[style] || ['Balanced ambient lighting'];

  const colorsByStyle: Record<string, string[]> = {
    [ImageStyle.CINEMATIC]: ['Rich amber and teal grades', 'Deep shadows with crushed blacks', 'Warm tones with cool background accents'],
    [ImageStyle.ANIME]: ['Vibrant pastel palette with high saturation', 'Soft pinks and sky blues', 'Warm yellows with purple twilight shadows'],
    [ImageStyle.PHOTOREALISTIC]: ['Natural earth tones with accurate color temperature', 'True-to-life skin tones and environmental colors'],
    [ImageStyle.FANTASY_ART]: ['Ethereal purples and magical golds', 'Deep emerald and sapphire with bioluminescent accents'],
    [ImageStyle.MINIMALIST]: ['Monochromatic scheme with one accent color', 'Beige and warm grey palette with navy accents'],
  };

  const palette = colorsByStyle[style] || ['Balanced complementary colors'];

  const technicalTerms: Record<string, string[]> = {
    [ImageStyle.CINEMATIC]: ['Anamorphic lens flare', 'Shallow depth of field (f/1.8)', '24fps motion blur', 'Film grain texture', 'Teal-orange color grade'],
    [ImageStyle.ANIME]: ['Cel-shaded rendering', 'Smooth gradient shading', 'Hand-drawn line art at 12fps', 'Soft focus backgrounds', 'Vibrant saturation boost'],
    [ImageStyle.PHOTOREALISTIC]: ['8K resolution capture', 'High dynamic range (14+ stops)', 'Diffraction-limited sharpness', 'Low noise ISO 100'],
    [ImageStyle.FANTASY_ART]: ['Particle effects for magical elements', 'Volumetric fog rendering', 'Glow and bloom effects', 'High-contrast magical lighting'],
  };

  const techDetail = technicalTerms[style] || ['Professional grade rendering'];

  const elementKeywords = prompt.split(/[\s,]+/).filter(w => w.length > 3).slice(0, 6);

  return {
    title: `${style.charAt(0).toUpperCase() + style.slice(1)} - ${prompt.split(' ').slice(0, 4).join(' ')}${prompt.split(' ').length > 4 ? '...' : ''}`,
    description: `A ${style} image (${dimensions}) based on: "${prompt}"`,
    composition: pickRandom(COMPOSITION_TYPES),
    colorPalette: palette,
    lighting: pickRandom(styleLighting),
    mood: pickRandom(styleMoods),
    cameraAngle: pickRandom(styleAngles),
    technicalDetails: techDetail,
    elements: elementKeywords.length > 0 ? elementKeywords : ['Main subject', 'Background environment', 'Atmospheric effects'],
  };
}

function formatSpecsAsText(specs: ImageSpecs): string {
  return [
    `\n┌──────────────────────────────────────────────────────────────`,
    `│  IMAGE GENERATION SPECIFICATION`,
    `├──────────────────────────────────────────────────────────────`,
    `│`,
    `│  Title:        ${specs.title}`,
    `│  Description:  ${specs.description}`,
    `│  Composition:  ${specs.composition}`,
    `│  Mood:         ${specs.mood}`,
    `│  Camera Angle: ${specs.cameraAngle}`,
    `│  Lighting:     ${specs.lighting}`,
    `│`,
    `│  Color Palette:`,
    ...specs.colorPalette.map(c => `│    • ${c}`),
    `│`,
    `│  Technical Details:`,
    ...specs.technicalDetails.map(t => `│    • ${t}`),
    `│`,
    `│  Key Elements:`,
    ...specs.elements.map(e => `│    • ${e.charAt(0).toUpperCase() + e.slice(1)}`),
    `│`,
    `└──────────────────────────────────────────────────────────────\n`,
  ].join('\n');
}

const enhancePromptStep = createStep({
  id: 'enhance-prompt',
  inputSchema: z.object({
    prompt: z.string(),
    style: ImageStyleSchema,
    aspectRatio: AspectRatioSchema,
    config: ConfigSchema,
  }),
  outputSchema: z.object({
    original: z.string(),
    enhanced: z.string(),
    style: ImageStyleSchema,
    styleDescription: z.string(),
    enhancements: z.array(z.string()),
    negativePrompt: z.string().optional(),
    aspectRatio: AspectRatioSchema,
    config: ConfigSchema,
  }),
  execute: async ({ inputData }) => {
    const { prompt, style, aspectRatio, config } = inputData;

    const stylePrefix = STYLE_PROMPT_PREFIXES[style as ImageStyle] || STYLE_PROMPT_PREFIXES[ImageStyle.CINEMATIC];
    const styleDesc = STYLE_DESCRIPTIONS[style as ImageStyle] || STYLE_DESCRIPTIONS[ImageStyle.CINEMATIC];
    const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio as AspectRatio] || ASPECT_RATIO_DIMENSIONS[AspectRatio.LANDSCAPE];

    const lightingTerms = [
      'volumetric lighting', 'soft diffused lighting', 'cinematic lighting',
      'dramatic atmospheric lighting', 'golden hour illumination', 'studio quality lighting',
    ];

    const qualityTerms = [
      '8K resolution', 'highly detailed', 'sharp focus',
      'intricate details', 'masterpiece quality', 'professional composition',
    ];

    const selectedLighting = lightingTerms[Math.floor(Math.random() * lightingTerms.length)];
    const q1 = qualityTerms[Math.floor(Math.random() * qualityTerms.length)];
    const q2 = qualityTerms[Math.floor(Math.random() * qualityTerms.length)];

    const enhanced = `${stylePrefix} ${prompt}, ${styleDesc}, ${selectedLighting}, ${q1}, ${q2}, ${dimensions} aspect ratio`;

    const enhancements = [
      `Applied "${style}" artistic style matching composition rules`,
      `Added ${selectedLighting} for atmospheric depth`,
      `Enhanced with quality descriptors: ${q1}, ${q2}`,
      `Optimized for ${dimensions} aspect ratio`,
    ];

    return {
      original: prompt,
      enhanced,
      style: style as ImageStyle,
      styleDescription: styleDesc,
      enhancements,
      negativePrompt: `low quality, blurry, distorted, ugly, deformed${style === ImageStyle.PHOTOREALISTIC ? ', cartoon, illustration' : ''}`,
      aspectRatio: aspectRatio as AspectRatio,
      config,
    };
  },
});

const generateImageStep = createStep({
  id: 'generate-image',
  inputSchema: z.object({
    enhanced: z.string(),
    style: ImageStyleSchema,
    aspectRatio: AspectRatioSchema,
    quality: ImageQualitySchema,
    negativePrompt: z.string().optional(),
    seed: z.number().int().positive().optional(),
    provider: z.string(),
    enhancements: z.array(z.string()),
    original: z.string(),
  }),
  outputSchema: z.object({
    images: z.array(z.object({
      url: z.string(),
      seed: z.number(),
      prompt: z.string(),
      style: ImageStyleSchema,
      aspectRatio: AspectRatioSchema,
      timestamp: z.string(),
      provider: z.string(),
      specs: z.string(),
    })),
    enhancedPrompt: z.object({
      original: z.string(),
      enhanced: z.string(),
      style: ImageStyleSchema,
      enhancements: z.array(z.string()),
    }),
    duration: z.number(),
    model: z.string(),
  }),
  execute: async ({ inputData }) => {
    const startTime = Date.now();
    const { enhanced, style, aspectRatio, seed, enhancements, original } = inputData;

    const specs = generateMockSpecs(enhanced, style as ImageStyle, aspectRatio as AspectRatio);
    const specsText = formatSpecsAsText(specs);
    const actualSeed = seed || Math.floor(Math.random() * 4294967295);

    const imageUrl = `[SIMULATED] seed=${actualSeed} style=${style} ratio=${aspectRatio}`;

    return {
      images: [{
        url: imageUrl,
        seed: actualSeed,
        prompt: enhanced,
        style: style as ImageStyle,
        aspectRatio: aspectRatio as AspectRatio,
        timestamp: new Date().toISOString(),
        provider: 'demo',
        specs: specsText,
      }],
      enhancedPrompt: {
        original,
        enhanced,
        style: style as ImageStyle,
        enhancements,
      },
      duration: Date.now() - startTime,
      model: 'image-specs-generator (demo)',
    };
  },
});

export const imageGenerationWorkflow = createWorkflow({
  id: 'image-generation-workflow',
  inputSchema: WorkflowInputSchema,
  outputSchema: z.object({
    images: z.array(z.object({
      url: z.string(),
      seed: z.number(),
      prompt: z.string(),
      style: ImageStyleSchema,
      aspectRatio: AspectRatioSchema,
      timestamp: z.string(),
      provider: z.string(),
      specs: z.string(),
    })),
    enhancedPrompt: z.object({
      original: z.string(),
      enhanced: z.string(),
      style: ImageStyleSchema,
      enhancements: z.array(z.string()),
    }),
    duration: z.number(),
    model: z.string(),
  }),
})
  .map(async ({ inputData }) => {
    return {
      prompt: inputData.prompt,
      style: inputData.style,
      aspectRatio: inputData.aspectRatio,
      config: {
        quality: inputData.quality,
        negativePrompt: inputData.negativePrompt,
        seed: inputData.seed,
        provider: inputData.provider || 'demo',
      },
    };
  })
  .then(enhancePromptStep)
  .map(async ({ inputData }) => {
    return {
      enhanced: inputData.enhanced,
      style: inputData.style,
      aspectRatio: inputData.aspectRatio,
      quality: inputData.config.quality,
      negativePrompt: inputData.negativePrompt,
      seed: inputData.config.seed,
      provider: inputData.config.provider,
      enhancements: inputData.enhancements,
      original: inputData.original,
    };
  })
  .then(generateImageStep)
  .commit();
