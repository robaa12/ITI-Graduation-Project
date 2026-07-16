import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ImageStyle, AspectRatio, ImageQuality, ImageSpecs } from '../../shared/types.js';
import { STYLE_DESCRIPTIONS, ASPECT_RATIO_DIMENSIONS } from '../../shared/constants.js';

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

function generateMockSpecs(
  prompt: string,
  style: ImageStyle,
  aspectRatio: AspectRatio,
  quality: ImageQuality,
): ImageSpecs {
  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio];

  const styleMoods = MOODS[style] || ['Balanced and harmonious'];
  const styleAngles = CAMERA_ANGLES[style] || ['Standard eye-level shot'];
  const styleLighting = LIGHTING_SETUPS[style] || ['Balanced ambient lighting'];

  const colorsByStyle: Record<string, string[]> = {
    [ImageStyle.CINEMATIC]: ['Rich amber and teal grades', 'Deep shadows with crushed blacks', 'Warm skin tones with cool background accents'],
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

  const elementKeywords = prompt
    .split(/[\s,]+/)
    .filter(w => w.length > 3)
    .slice(0, 6);

  const spec: ImageSpecs = {
    title: `${style.charAt(0).toUpperCase() + style.slice(1)} - ${prompt.split(' ').slice(0, 4).join(' ')}${prompt.split(' ').length > 4 ? '...' : ''}`,
    description: `A ${quality} quality ${style} image (${dimensions}) based on: "${prompt}"`,
    composition: pickRandom(COMPOSITION_TYPES),
    colorPalette: palette,
    lighting: pickRandom(styleLighting),
    mood: pickRandom(styleMoods),
    cameraAngle: pickRandom(styleAngles),
    technicalDetails: techDetail,
    elements: elementKeywords.length > 0 ? elementKeywords : ['Main subject', 'Background environment', 'Atmospheric effects'],
  };

  return spec;
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

export const imageGeneratorTool = createTool({
  id: 'image-generator',
  description:
    'Generates detailed image specifications from enhanced text prompts. Returns visual specs including composition, color palette, lighting, mood, and technical details as structured text output.',
  inputSchema: z.object({
    prompt: z.string().min(1).describe('The enhanced text prompt to generate specs from'),
    style: z.nativeEnum(ImageStyle).describe('The artistic style applied to the prompt'),
    aspectRatio: z.nativeEnum(AspectRatio).describe('The aspect ratio for the output image'),
    quality: z.nativeEnum(ImageQuality).default(ImageQuality.STANDARD).describe('Image quality level'),
    negativePrompt: z.string().optional().describe('Elements to avoid in the generated image'),
    seed: z.number().int().positive().optional().describe('Random seed for reproducible generation'),
    provider: z.string().optional().describe('Image generation provider (demo mode only)'),
  }),
  outputSchema: z.object({
    images: z.array(
      z.object({
        url: z.string(),
        seed: z.number(),
        prompt: z.string(),
        style: z.nativeEnum(ImageStyle),
        aspectRatio: z.nativeEnum(AspectRatio),
        timestamp: z.string(),
        provider: z.string(),
        specs: z.string(),
      }),
    ),
    model: z.string(),
  }),
  execute: async ({ prompt, style, aspectRatio, quality, seed }) => {
    const startTime = Date.now();
    const actualSeed = seed || Math.floor(Math.random() * 4294967295);

    const specs = generateMockSpecs(
      prompt,
      style as ImageStyle,
      aspectRatio as AspectRatio,
      quality as ImageQuality,
    );

    const specsText = formatSpecsAsText(specs);

    const imageUrl = `[SIMULATED] Image would be generated here with seed ${actualSeed} using style "${style}" at ${aspectRatio} aspect ratio`;

    return {
      images: [{
        url: imageUrl,
        seed: actualSeed,
        prompt,
        style: style as ImageStyle,
        aspectRatio: aspectRatio as AspectRatio,
        timestamp: new Date().toISOString(),
        provider: 'demo',
        specs: specsText,
      }],
      model: 'image-specs-generator-v1 (demo)',
    };
  },
});
