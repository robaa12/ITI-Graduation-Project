# Mastra Image Generation Agent

A proof-of-concept AI agent built with the [Mastra](https://mastra.ai) framework that transforms natural language prompts into detailed image specifications. No API keys required for the demo mode — fully self-contained.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Input Examples](#input-examples)
- [Expected Output](#expected-output)
- [Architecture](#architecture)
- [File-by-File Description](#file-by-file-description)
- [When You Have an API Key](#when-you-have-an-api-key)
- [All Commands](#all-commands)
- [Parameters Reference](#parameters-reference)
- [Project Structure](#project-structure)

---

## Quick Start

```bash
cd mastra-image-agent
npm install

# Run the demo (no API key needed)
npx tsx scripts/run-workflow.ts "a serene mountain lake at sunset" cinematic "16:9"

# Batch run with 5 sample prompts
npx tsx scripts/batch-generate.ts
```

That's it. No `.env` file needed, no API keys, no external services.

---

## Input Examples

### Single prompt

```bash
npx tsx scripts/run-workflow.ts "a serene mountain lake at sunset" cinematic "16:9"
```

### All styles

```bash
# Photorealistic
npx tsx scripts/run-workflow.ts "portrait of an elderly fisherman with weathered skin" photorealistic "4:3"

# Anime
npx tsx scripts/run-workflow.ts "a cyberpunk samurai on a neon rooftop" anime "9:16"

# Fantasy art
npx tsx scripts/run-workflow.ts "a dragon soaring above floating islands" fantasy-art "21:9"

# Minimalist
npx tsx scripts/run-workflow.ts "a clean workspace with a single plant" minimalist "1:1"

# Oil painting
npx tsx scripts/run-workflow.ts "a cozy ramen shop at night" oil-painting "4:3"
```

### Available styles

- `photorealistic` — Ultra-realistic photograph
- `cinematic` — Movie-like composition (default)
- `anime` — Japanese anime style
- `digital-art` — Modern digital illustration
- `oil-painting` — Classic oil-on-canvas
- `watercolor` — Soft watercolor wash
- `pixel-art` — Retro 8-bit/16-bit style
- `sketch` — Hand-drawn pencil/charcoal
- `3d-render` — Computer-generated 3D render
- `fantasy-art` — Epic fantasy illustration
- `vaporwave` — Neon retro-futuristic
- `minimalist` — Clean, minimal design

### Available aspect ratios

| Value | Ratio | Pixels | Best For |
|-------|-------|--------|----------|
| `1:1` | Square | 1024×1024 | Social media, icons |
| `16:9` | Landscape | 1792×1024 | Landscapes, wallpapers (default) |
| `9:16` | Portrait | 1024×1792 | Characters, mobile |
| `21:9` | Ultrawide | 1920×896 | Cinematic panoramas |
| `4:3` | Standard | 1280×960 | Classic photos |
| `3:2` | Classic | 1536×1024 | Print photography |

---

## Expected Output

Running the workflow produces two sections of output:

### 1. Enhanced Prompt

The original prompt enriched with style-specific artistic details:

```
Original:  "a serene mountain lake at sunset"
Enhanced:  "Cinematic scene of a serene mountain lake at sunset,
            Movie-like composition with dramatic lighting...,
            golden hour illumination, intricate details,
            professional composition, 1792x1024 aspect ratio"
```

### 2. Image Specification

A structured text document describing every aspect of what the generated image would contain:

```
┌──────────────────────────────────────────────────────────────
│  IMAGE GENERATION SPECIFICATION
├──────────────────────────────────────────────────────────────
│
│  Title:        Cinematic - a serene mountain lake...
│  Description:  A cinematic image (1792x1024) based on: "..."
│  Composition:  Golden spiral composition with the focal point
│                at the natural intersection of the spiral curve
│  Mood:         Epic and dramatic
│  Camera Angle: Low angle wide shot
│  Lighting:     Golden hour backlight creating a rim light effect
│
│  Color Palette:
│    • Rich amber and teal grades
│    • Deep shadows with crushed blacks
│    • Warm tones with cool background accents
│
│  Technical Details:
│    • Anamorphic lens flare
│    • Shallow depth of field (f/1.8)
│    • 24fps motion blur
│    • Film grain texture
│    • Teal-orange color grade
│
│  Key Elements:
│    • Serene
│    • Mountain
│    • Lake
│    • Sunset
│
└──────────────────────────────────────────────────────────────
```

---

## Architecture

### High-Level Flow

```
┌──────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│  User Prompt  │───▶│  Prompt Enhancement  │───▶│  Image Specs Gen    │
│  + Style/Ratio│    │       (Step 1)       │    │       (Step 2)       │
└──────────────┘    └──────────────────────┘    └─────────────────────┘
                                                         │
                                                         ▼
                                              ┌──────────────────────┐
                                              │  Structured Text     │
                                              │  (composition,       │
                                              │   palette, lighting, │
                                              │   mood, camera, etc) │
                                              └──────────────────────┘
```

### Two Execution Modes

| Mode | Runtime | API Key | Description |
|------|---------|---------|-------------|
| **Workflow** | `createWorkflow` | Not needed | Deterministic 2-step pipeline. Steps run in fixed order. |
| **Agent** | `Agent` class | `OPENAI_API_KEY` | LLM-driven. GPT-4o decides tool order and parameters. |

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Mastra Runtime                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Image Generation Workflow                    │ │
│  │  ┌──────────────────┐    ┌──────────────────────────┐   │ │
│  │  │  enhance-prompt  │───▶│     generate-image       │   │ │
│  │  │     (Step 1)     │    │        (Step 2)           │   │ │
│  │  └──────────────────┘    └──────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Image Agent (optional)                       │ │
│  │  Uses LLM (GPT-4o) to reason + call tools                │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## File-by-File Description

### `package.json`

Project manifest. Defines:
- **Dependencies**: `@mastra/core` (framework), `zod` (validation), `dotenv` (env vars)
- **Dev dependencies**: `mastra` (CLI), `typescript`, `tsx` (TS runner), `@types/node`
- **Scripts**: `run:workflow`, `run:agent`, `run:batch`, `typecheck`

### `tsconfig.json`

TypeScript configuration targeting ES2022 with bundler module resolution. Uses `noEmit` + `allowImportingTsExtensions` because `tsx` runs the TypeScript directly without compilation.

### `.env.example`

Template for environment variables. Only needed if you want to use the LLM-powered agent mode. The demo (workflow mode) requires no env vars.

### `src/shared/types.ts`

Core type definitions used across the entire project:
- **`ImageStyle`** enum — 12 art styles (cinematic, anime, fantasy-art, etc.)
- **`AspectRatio`** enum — 6 ratios (1:1, 16:9, 9:16, 21:9, 4:3, 3:2)
- **`ImageQuality`** enum — standard, hd
- **`ImageSpecs`** interface — the output shape: title, description, composition, colorPalette, lighting, mood, cameraAngle, technicalDetails, elements

### `src/shared/schemas.ts`

Zod validation schemas used by Mastra's `createTool` and `createStep`:
- `ImageStyleSchema` — validates style strings against the enum
- `AspectRatioSchema` — validates ratio strings
- `ImageQualitySchema` — validates quality level
- `ImageGenerationInputSchema` — validates the full workflow input object

### `src/shared/constants.ts`

Static lookup tables that drive the prompt enhancement and spec generation:
- `STYLE_DESCRIPTIONS` — artistic descriptions for each style
- `STYLE_PROMPT_PREFIXES` — prefix phrases (e.g., "Cinematic scene of")
- `ASPECT_RATIO_DIMENSIONS` — pixel dimensions per ratio
- `ERROR_CODES` — standardized error identifiers

### `src/mastra/tools/promptEnhancer.ts`

A Mastra `createTool` that enriches raw prompts with artistic details:
- **Input**: `{ prompt, style, aspectRatio }`
- **Logic**: Looks up style prefix + description, randomly selects lighting term and quality descriptors, concatenates into an optimized prompt
- **Output**: `{ original, enhanced, style, styleDescription, enhancements, negativePrompt }`
- **No API calls** — all local string manipulation

### `src/mastra/tools/imageGenerator.ts`

A Mastra `createTool` that generates structured image specifications:
- **Input**: `{ prompt, style, aspectRatio, quality }`
- **Logic**: Randomly selects composition, mood, camera angle, lighting, and technical details from style-specific lookup tables. Extracts key elements from prompt text.
- **Output**: `{ images: [{ specs, url, seed }], model }` where `specs` is a formatted text block
- **No API calls** — all local data generation

### `src/mastra/agents/imageAgent.ts`

An optional Mastra `Agent` powered by GPT-4o:
- System instructions explain the enhance → generate pipeline
- Equipped with both `promptEnhancer` and `imageGenerator` tools
- The LLM decides when to call each tool based on the user's request
- **Requires `OPENAI_API_KEY`** in `.env`

### `src/mastra/workflows/imageGenerationWorkflow.ts`

A deterministic `createWorkflow` with two steps:
1. **enhance-prompt** — Transforms raw input into an optimized prompt (same logic as `promptEnhancer` tool)
2. **generate-image** — Produces a detailed image specification (same logic as `imageGenerator` tool)

Connected via `.map()` transforms that handle type-safe data flow between steps.

### `src/mastra/index.ts`

The central Mastra instance that registers both the agent and workflow:
```typescript
export const mastra = new Mastra({
  agents: { imageAgent },
  workflows: { imageGenerationWorkflow },
});
```

### `scripts/run-workflow.ts`

Main demo entry point. Parses CLI args (prompt, style, aspectRatio), creates a workflow run, executes it, and prints the enhanced prompt + full image specs. No API key required.

### `scripts/run-agent.ts`

Alternative entry point using the LLM agent. Requires `OPENAI_API_KEY`. Shows a helpful message pointing to the workflow mode if no key is found.

### `scripts/batch-generate.ts`

Demo script that runs 5 sample prompts through the workflow and prints a summary per prompt. Useful for seeing how different styles/ratios affect the output.

### `docs/ARCHITECTURE.md`

In-depth architecture documentation including: component diagrams, pipeline flow, style reference tables, error handling, and future enhancement ideas.

### `examples/sample-prompts.md`

15 sample prompts organized by category (basic, advanced, style comparison) with expected output descriptions.

---

## When You Have an API Key

Adding real image generation is straightforward. Two options:

### Option A: Use the agent mode (easiest — zero code changes)

The `imageAgent.ts` already has the real tool wiring. Just:

1. Create `.env` file:
```bash
cp .env.example .env
```

2. Add your key:
```
OPENAI_API_KEY=sk-...
```

3. Run the agent:
```bash
npx tsx scripts/run-agent.ts "a serene mountain lake at sunset" cinematic "16:9"
```

The agent will use GPT-4o to reason about your prompt, call `promptEnhancer` to optimize it, then call `imageGenerator` which makes a real DALL-E 3 API call. **No code changes needed.**

### Option B: Connect the workflow to real APIs

The `imageGenerator.ts` tool already has `generateWithOpenAI()` and `generateWithStabilityAI()` functions fully written. They're dormant in the demo mode. To activate:

1. In `imageGenerationWorkflow.ts`, replace the inline mock generation (~lines 100-130) with a call to the tool's execute method
2. The existing code structure supports this — just uncomment/restore the `imageGeneratorTool.execute()` call from the original implementation

### What the agent mode adds

| Feature | Workflow Mode | Agent Mode |
|---------|--------------|------------|
| Prompt enhancement | ✓ Deterministic | ✓ LLM-optimized |
| Image specs | ✓ As text | ✓ As text |
| Real image URL | Demo placeholder | Actual DALL-E 3 URL |
| Revised prompt | N/A | From OpenAI API |
| Style selection | Manual | LLM recommends best fit |

---

## All Commands

```bash
# Install dependencies
npm install

# TypeScript type check
npx tsc --noEmit

# Workflow mode (recommended, no API key)
npx tsx scripts/run-workflow.ts "<prompt>" [style] [aspect-ratio]

# Agent mode (requires OPENAI_API_KEY)
npx tsx scripts/run-agent.ts "<prompt>" [style] [aspect-ratio]

# Batch demo
npx tsx scripts/batch-generate.ts
```

---

## Project Structure

```
mastra-image-agent/
├── package.json                  # Dependencies: @mastra/core, zod, tsx
├── tsconfig.json                 # TypeScript config (ES2022, bundler)
├── .gitignore                    # node_modules, dist, .env
├── .env.example                  # API key template (optional)
├── README.md                     # This file
├── src/
│   ├── mastra/
│   │   ├── index.ts              # Mastra instance — registers agent + workflow
│   │   ├── agents/
│   │   │   └── imageAgent.ts     # LLM agent (GPT-4o + tools, needs API key)
│   │   ├── tools/
│   │   │   ├── promptEnhancer.ts # Tool: enriches prompts with artistic details
│   │   │   └── imageGenerator.ts # Tool: generates structured image specs
│   │   └── workflows/
│   │       └── imageGenerationWorkflow.ts  # Deterministic 2-step pipeline
│   └── shared/
│       ├── types.ts              # Enums (ImageStyle, AspectRatio) + interfaces
│       ├── schemas.ts            # Zod validation schemas
│       └── constants.ts          # Style descriptions, lighting, mood lookups
├── scripts/
│   ├── run-agent.ts              # CLI: agent mode
│   ├── run-workflow.ts           # CLI: workflow mode (main demo)
│   └── batch-generate.ts         # CLI: batch demo with 5 prompts
├── examples/
│   └── sample-prompts.md         # 15 sample prompts with expected output
└── docs/
    └── ARCHITECTURE.md           # Full architecture documentation
```

---

## Design Decisions

1. **Zero external dependencies for demo** — All enhancement and spec generation logic is local. Random selection from curated lists provides variety without API calls.

2. **Style-appropriate variety** — Each style has its own curated lists of moods, camera angles, lighting setups, color palettes, and technical details. Random selection stays thematically consistent.

3. **Two execution modes** — The workflow is deterministic and always works. The agent adds LLM reasoning for smarter decisions when API keys are available.

4. **ASCII box output** — Final specs are formatted in a terminal-friendly box with sections and bullet points for readability as a standalone document.

5. **Mastra framework patterns** — Uses `createTool` for reusable tool definitions, `createWorkflow` + `createStep` for the pipeline, `Agent` for LLM mode, and `Mastra` as the central registry. All inputs/outputs validated with Zod.
