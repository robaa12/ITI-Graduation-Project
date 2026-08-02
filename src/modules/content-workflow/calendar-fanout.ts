import { ContentFormat, GeneratedContentStatus, Prisma } from '@prisma/client';

/**
 * One entry of `output.calendar` as the content workflow emits it. Everything
 * is optional here on purpose: this is untyped JSON crossing a service
 * boundary, and a schema change on the Mastra side must degrade into a
 * partially-filled row rather than throw inside the worker.
 */
interface CalendarEntry {
  date?: unknown;
  platform?: unknown;
  caption?: unknown;
  hashtags?: unknown;
  visualPrompt?: unknown;
  imageUrl?: unknown;
  cta?: unknown;
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Turns the workflow's calendar into GeneratedContent rows so the existing
 * list / export / edit endpoints work on them unchanged.
 *
 * The raw payload is kept verbatim on the run row, so this projection is
 * allowed to be lossy: it exists to make the content usable through the
 * per-item API, not to be the record of what the workflow said.
 */
export function toGeneratedContentRows(
  campaignId: string,
  contentRunId: string,
  output: unknown,
): Prisma.GeneratedContentCreateManyInput[] {
  const calendar = (output as { calendar?: unknown } | null)?.calendar;

  if (!Array.isArray(calendar)) {
    return [];
  }

  return calendar.map((raw: CalendarEntry, index) => {
    const platform = asString(raw?.platform) ?? 'social_post';
    const date = asString(raw?.date);

    return {
      campaignId,
      contentRunId,
      // `type` is a free-form string, so the platform doubles as the content
      // type — that is what the per-item endpoints filter on.
      type: platform,
      title: date ? `${platform} · ${date}` : `${platform} · #${index + 1}`,
      body: asString(raw?.caption),
      payload: {
        date: date ?? null,
        platform,
        hashtags: Array.isArray(raw?.hashtags) ? raw.hashtags : [],
        visualPrompt: asString(raw?.visualPrompt),
        imageUrl: asString(raw?.imageUrl),
        cta: asString(raw?.cta),
      },
      format: ContentFormat.TEXT,
      // Delivered content, not something waiting on a generation job.
      status: GeneratedContentStatus.READY,
      version: 1,
    };
  });
}
