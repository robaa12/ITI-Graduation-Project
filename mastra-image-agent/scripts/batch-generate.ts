import 'dotenv/config';
import { mastra } from '../src/mastra/index.js';
import { ImageStyle, AspectRatio, ImageQuality } from '../src/shared/types.js';

const samplePrompts = [
  {
    prompt: 'a serene mountain lake at sunset with pine trees reflecting in crystal clear water',
    style: ImageStyle.CINEMATIC,
    aspectRatio: AspectRatio.LANDSCAPE,
  },
  {
    prompt: 'a cyberpunk samurai standing on a neon-lit rooftop in Tokyo rain',
    style: ImageStyle.ANIME,
    aspectRatio: AspectRatio.PORTRAIT,
  },
  {
    prompt: 'a majestic dragon soaring above ancient floating islands with waterfalls',
    style: ImageStyle.FANTASY_ART,
    aspectRatio: AspectRatio.WIDE,
  },
  {
    prompt: 'a minimalist workspace with a single monitor, plant, and warm afternoon light',
    style: ImageStyle.MINIMALIST,
    aspectRatio: AspectRatio.SQUARE,
  },
  {
    prompt: 'an old librarian cat wearing spectacles, organizing ancient spellbooks by candlelight',
    style: ImageStyle.DIGITAL_ART,
    aspectRatio: AspectRatio.SQUARE,
  },
];

async function batchGenerate() {
  console.log('\n=== Mastra Image Generation Demo - Batch Run ===\n');
  console.log(`Running ${samplePrompts.length} generations...\n`);

  const workflow = mastra.getWorkflow('imageGenerationWorkflow');

  for (let i = 0; i < samplePrompts.length; i++) {
    const { prompt, style, aspectRatio } = samplePrompts[i];
    console.log(`[${i + 1}/${samplePrompts.length}] "${prompt.slice(0, 50)}..." (${style}, ${aspectRatio})`);

    try {
      const run = await workflow.createRun();
      const runResult = await run.start({
        inputData: {
          prompt,
          style,
          aspectRatio,
          quality: ImageQuality.HD,
          provider: 'demo',
        },
      });

      if (runResult.status === 'success') {
        const output = runResult.result as {
          images: Array<{ specs: string }>;
          enhancedPrompt: { enhanced: string; enhancements: string[] };
          duration: number;
        };
        console.log(`  ✓ Enhanced: "${output.enhancedPrompt.enhanced.slice(0, 70)}..."`);
        console.log(`  ✓ ${output.enhancedPrompt.enhancements.length} enhancements applied`);
        console.log(`  ✓ ${output.duration}ms\n`);
      } else {
        console.error(`  ✗ Failed: ${'error' in runResult ? runResult.error : 'Unknown error'}\n`);
      }
    } catch (error) {
      console.error(`  ✗ Error: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  console.log('=== Batch Complete ===\n');
}

batchGenerate();
