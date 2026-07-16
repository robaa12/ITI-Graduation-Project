import 'dotenv/config';
import { mastra } from '../src/mastra/index.js';

async function runAgent() {
  const agent = mastra.getAgent('imageAgent');

  const prompt = process.argv[2];
  if (!prompt) {
    console.error('Usage: tsx scripts/run-agent.ts <prompt> [style] [aspect-ratio]');
    console.error('Example: tsx scripts/run-agent.ts "a serene mountain lake at sunset" cinematic "16:9"');
    process.exit(1);
  }

  const style = process.argv[3] || 'cinematic';
  const aspectRatio = process.argv[4] || '16:9';

  console.log('\n=== Mastra Image Generation Agent (LLM-powered) ===\n');
  console.log(`Prompt:       "${prompt}"`);
  console.log(`Style:         ${style}`);
  console.log(`Aspect Ratio:  ${aspectRatio}\n`);
  console.log('Note: This mode requires OPENAI_API_KEY in .env for the LLM.\n');

  const fullPrompt = `Generate an image specification with these parameters:
- Prompt: ${prompt}
- Style: ${style}
- Aspect Ratio: ${aspectRatio}

First enhance the prompt using the promptEnhancer tool, then generate the image specs using the imageGenerator tool. Present the full results including the enhanced prompt, enhancements made, and the complete image specification.`;

  try {
    console.log('Processing...\n');
    const response = await agent.generate(fullPrompt);
    console.log('Agent Response:');
    console.log(response.text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('401') || msg.includes('API key') || msg.includes('OPENAI_API_KEY')) {
      console.log('Agent unavailable - no API key configured.');
      console.log('\nTip: Use the workflow mode instead (no API key needed):');
      console.log('  npx tsx scripts/run-workflow.ts "' + prompt + '" ' + style + ' ' + aspectRatio);
    } else {
      console.error('\nError:', msg);
    }
    process.exit(1);
  }
}

runAgent();
