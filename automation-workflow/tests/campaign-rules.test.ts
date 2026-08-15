import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSystemPrompt,
  getMetaObjective,
  isMetaChannel,
  META_CHANNELS,
} from '../src/mastra/agents/system-prompt.ts';

test('maps conversion campaigns to Meta sales objective', () => {
  assert.equal(getMetaObjective('conversion'), 'OUTCOME_SALES');
  assert.equal(getMetaObjective('retargeting'), 'OUTCOME_SALES');
  assert.equal(getMetaObjective('lead-generation'), 'OUTCOME_LEADS');
});

test('recognizes only Meta-owned campaign channels', () => {
  assert.deepEqual(META_CHANNELS, ['facebook', 'instagram', 'messenger', 'meta']);
  assert.equal(isMetaChannel(' Instagram '), true);
  assert.equal(isMetaChannel('youtube'), false);
});

test('renders valid objective and channel rules into the agent prompt', () => {
  const prompt = buildSystemPrompt('file:///workspace/');

  assert.match(prompt, /conversion or retargeting → OUTCOME_SALES/);
  assert.doesNotMatch(prompt, /OUTCOME_PURCHASE/);
  assert.match(prompt, /YouTube is not a Meta channel/);
});
