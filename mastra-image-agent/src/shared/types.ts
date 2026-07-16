export enum ImageStyle {
  PHOTOREALISTIC = 'photorealistic',
  CINEMATIC = 'cinematic',
  ANIME = 'anime',
  DIGITAL_ART = 'digital-art',
  OIL_PAINTING = 'oil-painting',
  WATERCOLOR = 'watercolor',
  PIXEL_ART = 'pixel-art',
  SKETCH = 'sketch',
  THREE_D_RENDER = '3d-render',
  FANTASY_ART = 'fantasy-art',
  VAPORWAVE = 'vaporwave',
  MINIMALIST = 'minimalist',
}

export enum AspectRatio {
  SQUARE = '1:1',
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
  WIDE = '21:9',
  STANDARD = '4:3',
  CLASSIC = '3:2',
}

export enum ImageQuality {
  STANDARD = 'standard',
  HD = 'hd',
}

export interface ImageSpecs {
  title: string;
  description: string;
  composition: string;
  colorPalette: string[];
  lighting: string;
  mood: string;
  cameraAngle: string;
  technicalDetails: string[];
  elements: string[];
}
