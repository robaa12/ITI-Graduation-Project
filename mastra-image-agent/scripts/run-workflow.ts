import 'dotenv/config';
import { mastra } from '../src/mastra/index.js';
import { ImageStyle, AspectRatio, ImageQuality } from '../src/shared/types.js';

async function runWorkflow() {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error('Usage: tsx scripts/run-workflow.ts <prompt> [style] [aspect-ratio]');
    console.error('Example: tsx scripts/run-workflow.ts "a serene mountain lake at sunset" cinematic 16:9');
    process.exit(1);
  }

  const style = (process.argv[3] || 'cinematic') as ImageStyle;
  const aspectRatio = (process.argv[4] || '16:9') as AspectRatio;

  console.log('\n=== Mastra Image Generation Demo ===\n');
  console.log('Input Parameters:');
  console.log(`  Prompt:       "${prompt}"`);
  console.log(`  Style:         ${style}`);
  console.log(`  Aspect Ratio:  ${aspectRatio}`);
  console.log('');

  try {
    const workflow = mastra.getWorkflow('imageGenerationWorkflow');
    const run = await workflow.createRun();

    console.log('Running prompt enhancement + image spec generation...\n');

    const runResult = await run.start({
      inputData: {
        prompt,
        style,
        aspectRatio,
        quality: ImageQuality.STANDARD,
        provider: 'demo',
      },
    });

    if (runResult.status !== 'success') {
      console.error('Workflow failed:', 'error' in runResult ? runResult.error : 'Unknown error');
      return;
    }

    const result = runResult.result as {
      images: Array<{ specs: string }>;
      enhancedPrompt: { original: string; enhanced: string; enhancements: string[] };
      duration: number;
      model: string;
    };

    console.log('=== Prompt Enhancement ===\n');
    console.log(`Original:  "${result.enhancedPrompt.original}"`);
    console.log(`Enhanced:  "${result.enhancedPrompt.enhanced}"\n`);

    console.log('Enhancements Applied:');
    for (const e of result.enhancedPrompt.enhancements) {
      console.log(`  ✓ ${e}`);
    }

    console.log(`\n=== Image Specifications (${result.model}) ===`);
    console.log(`Generated in ${result.duration}ms`);

    for (const img of result.images) {
      console.log(img.specs);
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runWorkflow();
