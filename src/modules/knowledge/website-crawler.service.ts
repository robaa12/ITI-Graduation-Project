import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { CheerioCrawler } from '@crawlee/cheerio';
import { RequestList } from '@crawlee/core';
import robotsParser from 'robots-parser';
import { assertPublicHostname } from './url-safety';

const MAX_PAGES = 20;
const MAX_DEPTH = 2;
const MAX_PAGE_BYTES = 5_000_000;
const MAX_PAGE_TEXT = 50_000;
const MAX_SITE_TEXT = 250_000;
const MIN_STATIC_TEXT = 500;
const SKIPPED_PATH =
  /\/(?:account|login|logout|cart|checkout|search|wp-admin)(?:\/|$)/i;
const TRACKING_PARAM = /^(?:utm_|fbclid$|gclid$|mc_[ce]id$)/i;

export interface CrawledWebsitePage {
  url: string;
  title: string;
  content: string;
  contentHash: string;
}

export interface WebsiteCrawlResult {
  pages: CrawledWebsitePage[];
  warnings: string[];
}

@Injectable()
export class WebsiteCrawlerService {
  async crawl(rawUrl: string): Promise<WebsiteCrawlResult> {
    const seed = this.canonicalUrl(rawUrl);
    const allowedHost = new URL(seed).hostname;
    const robots = await this.loadRobots(seed);
    const pages: CrawledWebsitePage[] = [];
    const warnings: string[] = [];
    const visited = new Set<string>();
    let pending = [seed];
    let totalCharacters = 0;

    for (
      let depth = 0;
      depth <= MAX_DEPTH && pending.length && pages.length < MAX_PAGES;
      depth += 1
    ) {
      const next: string[] = [];
      const batch = pending
        .filter((url) => {
          if (visited.has(url) || !this.isAllowed(url, allowedHost, robots))
            return false;
          visited.add(url);
          return true;
        })
        .slice(0, MAX_PAGES - pages.length);
      if (!batch.length) {
        pending = next;
        continue;
      }
      const isAllowed = this.isAllowed.bind(this);
      // A named/default request queue persists completed URLs across crawler
      // instances. Refreshing a source would then process zero pages because
      // the previous crawl had already claimed its homepage. This ephemeral
      // list starts every indexing run with exactly its current URL batch.
      const requestList = await RequestList.open(null, batch);

      const crawler = new CheerioCrawler({
        requestList,
        maxConcurrency: 1,
        maxRequestRetries: 1,
        requestHandlerTimeoutSecs: 25,
        preNavigationHooks: [
          async ({ request }) => {
            await assertPublicHostname(new URL(request.url).hostname);
          },
        ],
        async requestHandler({ $, request, response }) {
          const loadedUrl = request.loadedUrl ?? request.url;
          // Do not process a cross-origin redirect even if Crawlee followed
          // it. It cannot become an indexed source or reveal its response.
          if (!isAllowed(loadedUrl, allowedHost, robots)) {
            throw new Error('redirected outside the approved public host');
          }
          const bytes =
            (response?.body as { length?: number } | undefined)?.length ?? 0;
          if (bytes > MAX_PAGE_BYTES) {
            warnings.push(
              `${loadedUrl} — page exceeds the 5 MB ingestion limit`,
            );
            return;
          }
          const contentType = response?.headers['content-type'] ?? '';
          if (!/^(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) {
            warnings.push(`${loadedUrl} — skipped non-HTML content type`);
            return;
          }
          const extracted = extractWithCheerio($, loadedUrl);
          if (extracted.content.length >= MIN_STATIC_TEXT) {
            const remaining = MAX_SITE_TEXT - totalCharacters;
            if (remaining > 0) {
              const content = extracted.content.slice(
                0,
                Math.min(MAX_PAGE_TEXT, remaining),
              );
              pages.push(makePage(extracted.url, extracted.title, content));
              totalCharacters += content.length;
            }
          } else
            warnings.push(
              `${loadedUrl} — no readable static HTML content was available`,
            );
          if (depth < MAX_DEPTH && totalCharacters < MAX_SITE_TEXT) {
            $('a[href]').each((_, element) => {
              const href = $(element).attr('href');
              const candidate = href
                ? safeCanonicalUrl(href, loadedUrl)
                : undefined;
              if (
                candidate &&
                isAllowed(candidate, allowedHost, robots) &&
                !visited.has(candidate)
              )
                next.push(candidate);
            });
          }
        },
        failedRequestHandler({ request, error }) {
          warnings.push(
            `${request.url} — ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      });
      await crawler.run();
      pending = [...new Set(next)].slice(0, MAX_PAGES - pages.length);
    }

    if (!pages.length)
      throw new Error(
        warnings[0] ?? 'No readable public HTML pages were available',
      );
    return { pages, warnings: [...new Set(warnings)].slice(0, 20) };
  }

  private async loadRobots(seed: string) {
    const origin = new URL(seed).origin;
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        signal: AbortSignal.timeout(8_000),
      });
      return robotsParser(
        `${origin}/robots.txt`,
        response.ok ? await response.text() : '',
      );
    } catch {
      // A missing or temporarily unavailable robots file must not turn a valid
      // public source into a failed one. Disallow rules are respected whenever
      // the host publishes them.
      return robotsParser(`${origin}/robots.txt`, '');
    }
  }

  private isAllowed(
    rawUrl: string,
    host: string,
    robots: ReturnType<typeof robotsParser>,
  ) {
    const url = new URL(rawUrl);
    return (
      url.hostname === host &&
      ['http:', 'https:'].includes(url.protocol) &&
      !SKIPPED_PATH.test(url.pathname) &&
      robots.isAllowed(url.toString(), 'SadaKnowledgeBot') !== false
    );
  }

  private canonicalUrl(rawUrl: string) {
    const url = new URL(rawUrl);
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    return url.toString();
  }
}

export function extractWithCheerio($: any, url: string) {
  $('script, style, noscript, svg, nav, footer, header, form, aside').remove();
  const title =
    normalizeText($('title').first().text() || $('h1').first().text()) ||
    new URL(url).hostname;
  const canonical = $('link[rel="canonical"]').attr('href');
  // Wix and other site builders often leave an empty accessibility/layout
  // <main> before the server-rendered body content. Selecting `.first()`
  // silently discarded the real page and made an otherwise indexable site
  // appear to have no readable HTML.
  const content = ['main', 'article', 'body']
    .flatMap((selector) =>
      $(selector)
        .toArray()
        .map((element: unknown) => normalizeText($(element).text())),
    )
    .reduce(
      (longest, candidate) =>
        candidate.length > longest.length ? candidate : longest,
      '',
    );
  return {
    url: safeCanonicalUrl(canonical ?? url, url) ?? url,
    title,
    content,
  };
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function safeCanonicalUrl(value: string, base: string) {
  try {
    const url = new URL(value, base);
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return undefined;
  }
}

function makePage(
  url: string,
  title: string,
  content: string,
): CrawledWebsitePage {
  return {
    url,
    title,
    content,
    contentHash: createHash('sha256').update(content).digest('hex'),
  };
}
