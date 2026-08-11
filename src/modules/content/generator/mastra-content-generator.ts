import { Injectable } from '@nestjs/common';
import { ContentFormat } from '@prisma/client';

import { MastraClient } from '../../mastra/mastra.client';
import {
  ContentGenerationBrief,
  ContentGeneratorPort,
  GeneratedContentDraft,
} from './content-generator.port';

const CONTENT_FORMATS = new Set<string>(Object.values(ContentFormat));

interface MastraContentDraft {
  type?: unknown;
  title?: unknown;
  body?: unknown;
  payload?: unknown;
  format?: unknown;
  model?: unknown;
}

/** Real per-item generator backed by the authenticated Mastra service. */
@Injectable()
export class MastraContentGenerator implements ContentGeneratorPort {
  constructor(private readonly mastra: MastraClient) {}

  async generate(
    brief: ContentGenerationBrief,
  ): Promise<GeneratedContentDraft> {
    const raw = (await this.mastra.generateContentItem(
      brief,
    )) as MastraContentDraft;

    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof raw.type !== 'string' ||
      !raw.type ||
      typeof raw.body !== 'string' ||
      !raw.body
    ) {
      throw new Error('Mastra returned an invalid content draft');
    }

    return {
      type: raw.type,
      title: typeof raw.title === 'string' ? raw.title : null,
      body: raw.body,
      payload: raw.payload,
      format:
        typeof raw.format === 'string' && CONTENT_FORMATS.has(raw.format)
          ? (raw.format as ContentFormat)
          : ContentFormat.TEXT,
      model: typeof raw.model === 'string' ? raw.model : null,
    };
  }
}
