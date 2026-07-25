import { Injectable, Logger } from '@nestjs/common';
import { ContentFormat } from '@prisma/client';

import {
  ContentGenerationBrief,
  ContentGeneratorPort,
  GeneratedContentDraft,
} from './content-generator.port';

/**
 * Stand-in generator used until the generation agent is connected.
 *
 * It echoes the campaign brief back as markdown so the whole flow — generate,
 * view, edit, regenerate, export — works end to end. Replace the provider
 * bound to `CONTENT_GENERATOR` in `ContentModule` with the real agent client;
 * the rest of the module reads from {@link GeneratedContentDraft} only.
 */
@Injectable()
export class PlaceholderContentGenerator implements ContentGeneratorPort {
  private readonly logger = new Logger(PlaceholderContentGenerator.name);

  generate(brief: ContentGenerationBrief): Promise<GeneratedContentDraft> {
    this.logger.warn(
      `No generation agent connected — returning placeholder ${brief.type} for campaign ${brief.campaign.id}`,
    );

    const lines = [
      `# ${brief.campaign.name} — ${brief.type}`,
      '',
      brief.campaign.objective
        ? `**Objective:** ${brief.campaign.objective}`
        : null,
      brief.campaign.audience
        ? `**Audience:** ${brief.campaign.audience}`
        : null,
      brief.campaign.tone ? `**Tone:** ${brief.campaign.tone}` : null,
      brief.campaign.channels.length
        ? `**Channels:** ${brief.campaign.channels.join(', ')}`
        : null,
      brief.instructions ? `**Instructions:** ${brief.instructions}` : null,
      '',
      '_Placeholder output. Connect the generation agent to produce real content._',
    ].filter((line): line is string => line !== null);

    return Promise.resolve({
      type: brief.type,
      title: `${brief.campaign.name} — ${brief.type}`,
      body: lines.join('\n'),
      payload: { placeholder: true, brief: { type: brief.type } },
      format: ContentFormat.MARKDOWN,
      model: 'placeholder',
    });
  }
}
