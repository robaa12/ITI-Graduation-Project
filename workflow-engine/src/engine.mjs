const SUPPORTED_WORKFLOWS = new Set([
  'marketingStrategyWorkflow',
  'contentCreationWorkflow',
])

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  x: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube_shorts: 'YouTube Shorts',
}

const PLATFORM_HASHTAGS = {
  instagram: ['discover', 'community', 'behindthescenes'],
  x: ['buildinpublic', 'insights', 'community'],
  linkedin: ['leadership', 'innovation', 'growth'],
  facebook: ['community', 'smallbusiness', 'updates'],
  tiktok: ['learnontiktok', 'tips', 'community'],
  youtube_shorts: ['shorts', 'howto', 'insights'],
}

function text(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function words(value, limit = 14) {
  return text(value, '').replace(/\s+/g, ' ').split(' ').filter(Boolean).slice(0, limit).join(' ')
}

function shortName(description, fallback = 'Your product') {
  const firstLine = text(description, fallback).split(/\n|\.|!|\?/)[0]
  return words(firstLine, 8) || fallback
}

function strategySteps() {
  return Object.fromEntries([
    'intake-gate',
    'product-analysis',
    'stp-research',
    'stp-strategy',
    'buyer-persona',
    'buyer-journey',
    'smart-objectives',
    'campaign-planner',
    'quality-gate',
  ].map((id) => [id, { status: 'success' }]))
}

function contentSteps() {
  return Object.fromEntries([
    'build-brief',
    'content-research',
    'content-strategy',
    'generate-content',
    'generate-visuals',
    'generate-hashtags',
    'content-preflight',
    'schedule',
  ].map((id) => [id, { status: 'success' }]))
}

export function createStrategy(input = {}) {
  const intake = input.intake ?? {}
  const productName = shortName(input.description)
  const industry = text(input.industry, 'your industry')
  const businessType = text(input.businessType, 'business')
  const audience = text(input.targetMarket, text(intake.primaryIcp, 'the people most likely to benefit'))
  const geography = text(intake.targetGeography, 'your priority market')
  const goal = text(input.options?.primaryGoal, 'balanced').replace('-', ' ')
  const pricing = text(input.pricing, 'Pricing is still being validated.')
  const notes = text(input.additionalNotes, 'No additional constraints were supplied.')
  const maxPersonas = Math.min(Math.max(Number(input.options?.maxPersonas) || 3, 1), 3)

  const personaSeeds = [
    ['Primary champion', 'Decision maker', 'Pragmatic growth leader'],
    ['Daily user', 'Operational lead', 'Efficiency seeker'],
    ['Internal advocate', 'Team specialist', 'Trusted evaluator'],
  ].slice(0, maxPersonas)

  return {
    product: {
      name: productName,
      type: businessType,
      industry,
      valueProposition: `${productName} helps ${audience} make meaningful progress with a clear, practical path to value.`,
      pricingNotes: pricing,
      coreFeatures: ['A focused solution to a high-value problem', 'A faster path from evaluation to value', 'Clear outcomes users can communicate internally'],
      customerProblems: [`Unclear or fragmented ways to solve the problem ${productName} addresses`, 'Too much time spent comparing options', 'Difficulty proving progress to stakeholders'],
      uniqueSellingPoints: ['A specific point of view for the target audience', 'Practical guidance over generic promises', 'A campaign message that connects benefit to evidence'],
      differentiators: ['Audience-first positioning', 'Outcome-led storytelling', 'Consistent cross-channel narrative'],
      assumptions: [`The initial audience focus is ${audience}.`, `The first campaign market is ${geography}.`, notes],
    },
    stp: {
      segments: [
        { id: 'primary', label: audience, rationale: 'Highest expected need and ability to act now.' },
        { id: 'adjacent', label: `Adjacent ${industry} evaluators`, rationale: 'A nearby segment with similar needs.' },
      ],
      targetedSegments: ['primary'],
      positioning: {
        positioningStatement: `For ${audience}, ${productName} is the ${businessType} that turns a difficult priority into visible progress.`,
        brandPromise: `A clearer, more confident way to move from intent to outcome in ${industry}.`,
        reasonToBelieve: 'Lead with verified proof points as they become available; do not turn assumptions into claims.',
      },
    },
    personas: personaSeeds.map(([name, role, archetype], index) => ({
      id: `persona-${index + 1}`,
      name,
      role,
      archetype,
      summary: `${name} represents ${audience}. They need a credible path to a better outcome without adding unnecessary complexity.`,
      goals: ['Make a confident choice', 'Show measurable progress', 'Reduce friction for their team'],
      frustrations: ['Generic marketing promises', 'Long evaluation cycles', 'Unclear implementation effort'],
      buyingTriggers: ['A pressing performance gap', 'A new initiative or deadline', 'A trusted proof point from a similar team'],
      objections: ['Will this fit our current workflow?', 'Can we justify the investment?', 'How quickly will we see value?'],
    })),
    buyerJourney: [
      { stage: 'Awareness', audienceNeed: 'Recognise the cost of the current approach.', message: `Name the problem ${productName} solves in the audience's language.` },
      { stage: 'Consideration', audienceNeed: 'Understand what a better approach looks like.', message: 'Show the practical method, proof, and trade-offs.' },
      { stage: 'Decision', audienceNeed: 'Feel safe taking the next step.', message: 'Make the first action specific, low-friction, and measurable.' },
    ],
    smartObjectives: [
      { id: 'objective-1', objective: `Build qualified awareness for ${productName} among ${audience}.`, targetValue: 'Establish a baseline and improve it over the campaign', deadline: 'First campaign cycle', kpi: 'Qualified reach and engaged visits', measurementMethod: 'Platform analytics and tagged landing-page traffic', reasoning: `Awareness supports the selected ${goal} objective while creating a usable benchmark.` },
      { id: 'objective-2', objective: 'Convert engaged prospects into a clear next step.', targetValue: 'Increase high-intent actions from campaign traffic', deadline: 'First campaign cycle', kpi: 'Demo, trial, or contact conversion rate', measurementMethod: 'UTM-tagged conversion events', reasoning: 'A single, consistent CTA makes learning and optimisation possible.' },
    ],
    campaignStrategy: {
      summary: `Position ${productName} as the practical choice for ${audience}: clear about the problem, credible about the value, and specific about the next step.`,
      audienceStrategy: { primaryAudience: audience, geography, insight: 'The audience is looking for confidence and momentum, not another generic promise.' },
      primaryChannels: ['linkedin', 'instagram'],
      creativeDirection: {
        storytellingApproach: 'Move from a recognisable challenge to a concrete better future, then make the first step feel achievable.',
        visualStyle: 'Human, editorial, and proof-led: useful moments, clear interfaces, and simple visual hierarchy.',
        keyMessages: [`${productName} makes the next step clearer.`, 'Progress should be visible, not hypothetical.', 'Choose evidence and usefulness over exaggerated claims.'],
        doList: ['Use concrete customer language', 'Show the before-and-after of the workflow', 'Keep claims tied to available evidence'],
      },
      ctaStrategy: { primaryCta: 'See how it works', ctaHierarchy: 'Lead with learning, then invite a lower-friction evaluation or conversation.' },
      campaignRecommendations: [
        { objective: 'Create a three-part narrative: problem, method, proof.', owner: 'Marketing', timing: 'Week 1–2' },
        { objective: 'Test one primary CTA and one supporting proof point across channels.', owner: 'Growth', timing: 'Week 2–3' },
      ],
      kpis: ['Qualified reach', 'Engaged visits', 'High-intent conversion rate'],
    },
    planQuality: { score: 72, status: 'ready for review', strengths: ['Clear audience focus', 'Outcome-led narrative'], risks: ['Validate proof points before publishing', 'Replace unknown baseline metrics with measured values'] },
  }
}

function campaignDays(duration, postsPerWeek) {
  const weeks = Math.max(1, Number.parseInt(String(duration), 10) || 2)
  const count = Math.min(20, Math.max(1, weeks * Math.max(1, Number(postsPerWeek) || 3)))
  const start = new Date()
  start.setHours(12, 0, 0, 0)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + Math.round(index * (weeks * 7 / count)))
    return date.toISOString().slice(0, 10)
  })
}

export function createContent(input = {}) {
  const brandName = text(input.brandName, 'Your brand')
  const product = text(input.product, brandName)
  const audience = text(input.targetAudience, 'your audience')
  const platforms = Array.isArray(input.platforms) && input.platforms.length ? input.platforms : ['linkedin']
  const calendar = campaignDays(input.duration, input.postsPerWeek).map((date, index) => {
    const platform = platforms[index % platforms.length]
    const label = PLATFORM_LABELS[platform] ?? platform
    const hook = [
      `What would change if ${audience} could make this decision with more confidence?`,
      `A better workflow does not start with more noise. It starts with a clearer next move.`,
      `The most useful progress is the kind your team can see and explain.`,
    ][index % 3]
    return {
      date,
      platform,
      caption: `${hook}\n\n${brandName} helps make that possible with ${words(product, 18)}. Focus on the outcome, show the method, and make the next step simple.\n\nSee how it works.`,
      hashtags: PLATFORM_HASHTAGS[platform] ?? ['marketing', 'growth', 'community'],
      visualPrompt: `Editorial ${label} campaign image for ${brandName}: a real person in a focused work moment, visualising clarity and progress, warm natural light, simple composition, no text overlay.`,
      cta: 'See how it works',
    }
  })
  return {
    strategy: {
      coreNarrative: `${brandName} gives ${audience} a clearer way to move from a difficult problem to visible progress.`,
      contentPillars: [
        { name: 'The challenge', description: 'Name the cost of the current approach in the audience’s own language.' },
        { name: 'The method', description: 'Show the practical steps and decisions behind better outcomes.' },
        { name: 'The proof', description: 'Use evidence, examples, and transparent expectations to earn trust.' },
      ],
      tonePerPlatform: Object.fromEntries(platforms.map((platform) => [platform, platform === 'linkedin' ? 'clear, credible, and useful' : 'warm, direct, and encouraging'])),
      rationale: 'The calendar balances problem recognition, practical education, and a consistent next step.',
    },
    calendar,
    notes: [{ severity: 'info', message: 'Review every factual claim and replace placeholders with verified proof before publishing.', resolved: false }],
  }
}

export class WorkflowEngine {
  #runs = new Map()

  createRun(workflowId, runId) {
    if (!SUPPORTED_WORKFLOWS.has(workflowId)) throw new Error(`Unknown workflow: ${workflowId}`)
    if (!runId) throw new Error('runId is required')
    if (this.#runs.has(runId)) throw new Error(`Run already exists: ${runId}`)
    const run = { workflowId, runId, status: 'running', result: null, error: null, steps: {} }
    this.#runs.set(runId, run)
    return run
  }

  startRun(workflowId, runId, inputData) {
    const run = this.getRun(workflowId, runId)
    try {
      run.result = workflowId === 'marketingStrategyWorkflow' ? createStrategy(inputData) : createContent(inputData)
      run.steps = workflowId === 'marketingStrategyWorkflow' ? strategySteps() : contentSteps()
      run.status = 'success'
    } catch (error) {
      run.status = 'failed'
      run.error = error instanceof Error ? error.message : String(error)
    }
    return run
  }

  getRun(workflowId, runId) {
    const run = this.#runs.get(runId)
    if (!run || run.workflowId !== workflowId) throw new Error(`Run not found: ${runId}`)
    return run
  }

  cancelRun(workflowId, runId) {
    const run = this.getRun(workflowId, runId)
    run.status = 'canceled'
    return { message: 'Workflow run canceled' }
  }
}
