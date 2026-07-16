# Sample Prompts

Run any of these with:

```bash
npx tsx scripts/run-workflow.ts "<prompt>" <style> <aspect-ratio>
```

## Basic

| # | Prompt | Style | Ratio |
|---|--------|-------|-------|
| 1 | a serene mountain lake at sunset with pine trees reflecting in crystal clear water | cinematic | 16:9 |
| 2 | a cyberpunk samurai standing on a neon-lit rooftop in Tokyo rain | anime | 9:16 |
| 3 | a majestic dragon soaring above ancient floating islands with waterfalls | fantasy-art | 21:9 |
| 4 | a minimalist workspace with a single monitor, plant, and warm afternoon light | minimalist | 1:1 |
| 5 | an old librarian cat wearing spectacles, organizing ancient spellbooks by candlelight | digital-art | 1:1 |

## Advanced

| # | Prompt | Style | Ratio |
|---|--------|-------|-------|
| 6 | a photorealistic portrait of an elderly fisherman with weathered skin, deep wrinkles, and bright blue eyes reflecting years of stories | photorealistic | 4:3 |
| 7 | a sprawling alien marketplace on a distant planet with bioluminescent flora, floating stalls, and creatures of all shapes haggling under three moons | fantasy-art | 21:9 |
| 8 | a cozy Japanese ramen shop interior at night, steam rising from bowls, warm lantern light, rain on the window | oil-painting | 4:3 |
| 9 | a pixel-art RPG village with a castle on a hill, farmers in fields, and a dragon circling in the distance | pixel-art | 16:9 |
| 10 | a graceful ballerina dancing in an abandoned grand ballroom with shattered chandeliers and moonlight streaming through broken windows | watercolor | 3:2 |
| 11 | a futuristic neon-drenched cityscape with flying cars and holographic billboards reflecting on wet streets at midnight | vaporwave | 16:9 |
| 12 | a detailed black and white sketch of a Victorian-era inventor's workshop filled with clockwork machines and blueprints | sketch | 4:3 |
| 13 | a 3D render of a futuristic sports car with carbon fiber details and glowing underglow in a minimalist showroom | 3d-render | 16:9 |
| 14 | an enchanted forest clearing with giant mushrooms, floating fireflies, and a hidden fairy village built into tree roots | fantasy-art | 16:9 |
| 15 | a lone lighthouse on a rocky cliff during a thunderstorm with waves crashing against the rocks | cinematic | 16:9 |

## Style Comparison

Same subject, different styles:

**Subject:** "a lone lighthouse on a rocky cliff during a thunderstorm"

| Style | What to expect |
|-------|----------------|
| photorealistic | True-to-life storm clouds, spray, texture |
| cinematic | Dramatic lightning, teal-orange grade, epic framing |
| oil-painting | Thick brushstrokes, rich dark tones, classical feel |
| anime | Stylized storm, dramatic sky, expressive clouds |
| minimalist | Simplified shapes, negative space, muted palette |

## Batch Demo

```bash
npx tsx scripts/batch-generate.ts
```

Runs all 5 basic prompts automatically and shows a summary of each result.
