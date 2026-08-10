import test from 'node:test'
import assert from 'node:assert/strict'
import { WorkflowEngine } from '../src/engine.mjs'

test('strategy runs return the plan expected by the frontend', () => {
  const engine = new WorkflowEngine()
  engine.createRun('marketingStrategyWorkflow', 'strategy-run')
  const run = engine.startRun('marketingStrategyWorkflow', 'strategy-run', {
    description: 'A scheduling platform for small marketing teams.',
    industry: 'Marketing software',
    businessType: 'SaaS',
    targetMarket: 'small marketing teams',
    intake: { primaryIcp: 'small marketing teams' },
    options: { maxPersonas: 2, primaryGoal: 'lead-generation' },
  })

  assert.equal(run.status, 'success')
  assert.equal(run.result.product.industry, 'Marketing software')
  assert.equal(run.result.personas.length, 2)
  assert.equal(typeof run.result.campaignStrategy.summary, 'string')
  assert.equal(run.steps['quality-gate'].status, 'success')
})

test('content runs create platform-aware calendar entries', () => {
  const engine = new WorkflowEngine()
  engine.createRun('contentCreationWorkflow', 'content-run')
  const run = engine.startRun('contentCreationWorkflow', 'content-run', {
    brandName: 'AetherFlow',
    product: 'Campaign workflow platform',
    targetAudience: 'marketing leaders',
    platforms: ['linkedin', 'instagram'],
    duration: '2 weeks',
    postsPerWeek: 2,
  })

  assert.equal(run.status, 'success')
  assert.equal(run.result.calendar.length, 4)
  assert.equal(run.result.calendar[0].platform, 'linkedin')
  assert.ok(run.result.calendar[0].hashtags.length > 0)
  assert.equal(run.steps.schedule.status, 'success')
})
