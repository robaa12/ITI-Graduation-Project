import { Mastra } from '@mastra/core';
import { imageAgent } from './agents/imageAgent.js';
import { imageGenerationWorkflow } from './workflows/imageGenerationWorkflow.js';

export const mastra = new Mastra({
  agents: { imageAgent },
  workflows: { imageGenerationWorkflow },
});
