import { ContentFormat } from '@prisma/client';

/**
 * Injection token for the content generator. Swap the provider bound to this
 * token in {@link ContentModule} when the generation agent is wired in — no
 * other file in this module needs to change.
 */
export const CONTENT_GENERATOR = Symbol('CONTENT_GENERATOR');

/** Everything the agent needs to know about what it is writing for. */
export interface ContentGenerationBrief {
  project: {
    id: string;
    name: string;
    description: string | null;
  };
  campaign: {
    id: string;
    name: string;
    description: string | null;
    objective: string | null;
    audience: string | null;
    tone: string | null;
    channels: string[];
    startDate: Date | null;
    endDate: Date | null;
  };
  /** Caller-defined kind of output, e.g. "social_post", "email", "ad_copy". */
  type: string;
  /** Free-form extra direction from the user. */
  instructions?: string;
  /** Set on regenerate so the agent can improve on what it produced before. */
  previous?: {
    title: string | null;
    body: string | null;
    payload: unknown;
  } | null;
}

/** What the agent hands back. Only `type` is required. */
export interface GeneratedContentDraft {
  type: string;
  title?: string | null;
  /** Human-readable rendering of the output, used for markdown/CSV export. */
  body?: string | null;
  /** Raw structured output exactly as the agent returned it. */
  payload?: unknown;
  format?: ContentFormat;
  /** Identifier of the model/agent that produced this, for traceability. */
  model?: string | null;
}

export interface ContentGeneratorPort {
  generate(brief: ContentGenerationBrief): Promise<GeneratedContentDraft>;
}
