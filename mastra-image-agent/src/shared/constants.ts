import { ImageStyle, AspectRatio } from './types.js';

export const STYLE_DESCRIPTIONS: Record<ImageStyle, string> = {
  [ImageStyle.PHOTOREALISTIC]:
    'Ultra-realistic photograph with natural lighting, sharp details, and authentic textures. Captures the scene as if photographed with a professional camera.',
  [ImageStyle.CINEMATIC]:
    'Movie-like composition with dramatic lighting, rich colors, cinematic color grading, shallow depth of field, and widescreen framing.',
  [ImageStyle.ANIME]:
    'Japanese anime style with vibrant colors, expressive features, hand-drawn aesthetics, cel-shading, and stylized backgrounds.',
  [ImageStyle.DIGITAL_ART]:
    'Modern digital illustration with crisp vectors, smooth gradients, vibrant colors, and contemporary design sensibilities.',
  [ImageStyle.OIL_PAINTING]:
    'Classic oil-on-canvas appearance with rich impasto textures, visible brushstrokes, warm color palette, and painterly depth.',
  [ImageStyle.WATERCOLOR]:
    'Soft watercolor wash effect with blending colors, paper texture, gentle gradients, and organic, flowing forms.',
  [ImageStyle.PIXEL_ART]:
    'Retro pixel art style with blocky 8-bit or 16-bit aesthetics, limited color palette, and grid-based construction.',
  [ImageStyle.SKETCH]:
    'Hand-drawn sketch with pencil or charcoal lines, cross-hatching, monochrome or limited color, with rough artistic edges.',
  [ImageStyle.THREE_D_RENDER]:
    'Computer-generated 3D render with ray-traced lighting, smooth surfaces, realistic materials, and dimensional depth.',
  [ImageStyle.FANTASY_ART]:
    'Epic fantasy illustration with magical elements, dramatic compositions, mythical creatures, and otherworldly atmospheres.',
  [ImageStyle.VAPORWAVE]:
    'Retro-futuristic aesthetic with neon glows, pastel gradients, glitch effects, glass grids, and 80s/90s nostalgia elements.',
  [ImageStyle.MINIMALIST]:
    'Clean, minimal design with ample negative space, simple geometric forms, restrained color palette, and focus on essential elements.',
};

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, string> = {
  [AspectRatio.SQUARE]: '1024x1024',
  [AspectRatio.LANDSCAPE]: '1792x1024',
  [AspectRatio.PORTRAIT]: '1024x1792',
  [AspectRatio.WIDE]: '1920x896',
  [AspectRatio.STANDARD]: '1280x960',
  [AspectRatio.CLASSIC]: '1536x1024',
};

export const OPENAI_SUPPORTED_RATIOS: Record<AspectRatio, string> = {
  [AspectRatio.SQUARE]: '1024x1024',
  [AspectRatio.LANDSCAPE]: '1792x1024',
  [AspectRatio.PORTRAIT]: '1024x1792',
  [AspectRatio.WIDE]: '1792x1024',
  [AspectRatio.STANDARD]: '1024x1024',
  [AspectRatio.CLASSIC]: '1792x1024',
};

export const STYLE_PROMPT_PREFIXES: Record<ImageStyle, string> = {
  [ImageStyle.PHOTOREALISTIC]:
    'A photorealistic photograph of',
  [ImageStyle.CINEMATIC]:
    'Cinematic scene of',
  [ImageStyle.ANIME]: 'Anime-style illustration of',
  [ImageStyle.DIGITAL_ART]: 'Digital artwork of',
  [ImageStyle.OIL_PAINTING]: 'Oil painting of',
  [ImageStyle.WATERCOLOR]: 'Watercolor painting of',
  [ImageStyle.PIXEL_ART]: 'Pixel art of',
  [ImageStyle.SKETCH]: 'Hand-drawn sketch of',
  [ImageStyle.THREE_D_RENDER]: '3D render of',
  [ImageStyle.FANTASY_ART]: 'Fantasy artwork of',
  [ImageStyle.VAPORWAVE]: 'Vaporwave-style artwork of',
  [ImageStyle.MINIMALIST]: 'Minimalist composition of',
};

export const ERROR_CODES = {
  INVALID_PROMPT: 'INVALID_PROMPT',
  PROMPT_TOO_SHORT: 'PROMPT_TOO_SHORT',
  PROMPT_TOO_LONG: 'PROMPT_TOO_LONG',
  API_KEY_MISSING: 'API_KEY_MISSING',
  API_ERROR: 'API_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_STYLE: 'INVALID_STYLE',
  INVALID_ASPECT_RATIO: 'INVALID_ASPECT_RATIO',
  GENERATION_FAILED: 'GENERATION_FAILED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
