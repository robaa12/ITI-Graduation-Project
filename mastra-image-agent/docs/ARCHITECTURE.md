# Mastra Image Generation Agent - Architecture

## Overview

A proof-of-concept Mastra agent that transforms natural language prompts into detailed image specifications. Designed as a zero-dependency demo — no API keys required.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     User Input (Prompt)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mastra Runtime                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Image Generation Workflow                    │ │
│  │                                                           │ │
│  │  ┌──────────────────────┐    ┌──────────────────────┐   │ │
│  │  │    Enhance Prompt    │───▶│  Generate Image Specs │   │ │
│  │  │       (Step 1)       │    │       (Step 2)        │   │ │
│  │  └──────────────────────┘    └──────────────────────┘   │ │
│  │                                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                Image Agent (optional)                     │ │
│  │  Uses GPT-4o to orchestrate tools via LLM reasoning      │ │
│  │  Requires OPENAI_API_KEY                                  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Image Specification (text)                   │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  • Composition & Framing                                  │ │
│  │  • Color Palette                                          │ │
│  │  • Lighting Setup                                         │ │
│  │  • Mood & Atmosphere                                      │ │
│  │  • Camera Angle                                           │ │
│  │  • Technical Details                                      │ │
│  │  • Key Visual Elements                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Mastra Entry Point (`src/mastra/index.ts`)
Registers the agent and workflow with the Mastra runtime.

### 2. Tools

#### promptEnhancer (`src/mastra/tools/promptEnhancer.ts`)
Enhances raw prompts by adding style-appropriate artistic details:
- **Style prefix** aligned to the chosen art style
- **Style description** detailing the artistic characteristics
- **Lighting terms** (volumetric, cinematic, golden hour, etc.)
- **Quality descriptors** (8K resolution, sharp focus, etc.)
- **Aspect ratio optimization**

#### imageGenerator (`src/mastra/tools/imageGenerator.ts`)
Generates structured image specifications with randomized but style-appropriate details:
- **Composition types**: Rule of thirds, golden spiral, symmetrical, diagonal, etc.
- **Color palettes**: Style-specific color schemes
- **Lighting setups**: Three-point, golden hour, bioluminescent, etc.
- **Camera angles**: Low angle, Dutch angle, bird's eye, etc.
- **Technical details**: Style-appropriate rendering specs

### 3. Workflow (`src/mastra/workflows/imageGenerationWorkflow.ts`)
A two-step deterministic pipeline connected via `.then()`:
1. **enhance-prompt** - Transforms raw input into optimized prompt
2. **generate-image** - Produces detailed image specification from enhanced prompt

### 4. Agent (`src/mastra/agents/imageAgent.ts`)
Optional LLM-powered agent that uses GPT-4o to reason about tool selection. Requires `OPENAI_API_KEY`.

## Generation Pipeline

```
Raw Prompt: "a cat wearing a hat"
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Prompt Enhancement Layer                                      │
│                                                               │
│  Enhanced: "Digital artwork of a cat wearing a hat,           │
│  Modern digital illustration with crisp vectors...,           │
│  volumetric lighting, 8K resolution, sharp focus...,          │
│  1024x1024 aspect ratio"                                      │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Image Specification Generator                                 │
│                                                               │
│  ┌─ Composition ───────────────────────────────────────────┐  │
│  │  Centered composition with symmetrical balance...        │  │
│  ├─ Color Palette ─────────────────────────────────────────┤  │
│  │  • Vibrant pastel palette with high saturation           │  │
│  │  • Soft pinks and sky blues                              │  │
│  ├─ Lighting ──────────────────────────────────────────────┤  │
│  │  Soft diffused lighting with pastel-colored bounce light │  │
│  ├─ Mood ──────────────────────────────────────────────────┤  │
│  │  Whimsical and dreamy                                    │  │
│  ├─ Camera ────────────────────────────────────────────────┤  │
│  │  Close-up with bokeh background                          │  │
│  ├─ Technical ─────────────────────────────────────────────┤  │
│  │  • Cel-shaded rendering                                  │  │
│  │  • Smooth gradient shading                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Configuration Options

### Styles (12 supported)
| Style | Description |
|-------|-------------|
| photorealistic | Ultra-realistic photograph |
| cinematic | Movie-like composition |
| anime | Japanese anime style |
| digital-art | Modern digital illustration |
| oil-painting | Classic oil-on-canvas |
| watercolor | Soft watercolor wash |
| pixel-art | Retro 8-bit/16-bit style |
| sketch | Hand-drawn pencil/charcoal |
| 3d-render | Computer-generated 3D |
| fantasy-art | Epic fantasy illustration |
| vaporwave | Neon retro-futuristic |
| minimalist | Clean, minimal design |

### Aspect Ratios
| Ratio | Dimensions | Use Case |
|-------|-----------|----------|
| 1:1 | 1024×1024 | Social media, icons |
| 16:9 | 1792×1024 | Landscapes, wallpapers |
| 9:16 | 1024×1792 | Portraits, mobile |
| 21:9 | 1920×896 | Cinematic panoramas |
| 4:3 | 1280×960 | Classic photos |
| 3:2 | 1536×1024 | Print photography |

## Folder Structure

```
mastra-image-agent/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── mastra/
│   │   ├── index.ts              # Mastra entry point
│   │   ├── agents/
│   │   │   └── imageAgent.ts     # Optional LLM agent
│   │   ├── tools/
│   │   │   ├── promptEnhancer.ts # Prompt enrichment
│   │   │   └── imageGenerator.ts # Image spec generator
│   │   └── workflows/
│   │       └── imageGenerationWorkflow.ts  # 2-step pipeline
│   └── shared/
│       ├── types.ts              # Enums & interfaces
│       ├── schemas.ts            # Zod validation
│       └── constants.ts          # Style maps, dimensions
├── scripts/
│   ├── run-agent.ts              # LLM agent mode
│   ├── run-workflow.ts           # Workflow mode (no API key)
│   └── batch-generate.ts         # Batch demo
├── examples/
│   └── sample-prompts.md
└── docs/
    └── ARCHITECTURE.md
```

## Future Enhancements

1. **Real image generation**: Connect to DALL-E 3, Stability AI, or Midjourney
2. **Image-to-image**: Support editing existing images
3. **Inpainting/Outpainting**: Fill or expand image regions
4. **Style transfer**: Apply style from reference images
5. **Multi-round refinement**: Iterative generation based on feedback
6. **Web UI**: Integrate with Mastra Studio or build a custom frontend
7. **Image analysis**: Use vision models to evaluate generated images
