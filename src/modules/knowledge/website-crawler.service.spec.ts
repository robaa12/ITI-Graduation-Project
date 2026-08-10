import { load } from 'cheerio';

import { extractWithCheerio } from './website-crawler.service';

describe('website content extraction', () => {
  it('uses the longest readable container when a site-builder main element is empty', () => {
    const $ = load(`
      <html><head><title>Protein Box</title></head><body>
        <header>Navigation that should not be indexed</header>
        <main aria-label="layout shell"></main>
        <section><h1>Healthy meal delivery</h1><p>${'Fresh, macro-counted meals delivered across Cairo. '.repeat(20)}</p></section>
        <footer>Footer links that should not be indexed</footer>
      </body></html>
    `);

    const page = extractWithCheerio($, 'https://www.proteinbox-egypt.com/');

    expect(page.title).toBe('Protein Box');
    expect(page.content).toContain('Healthy meal delivery');
    expect(page.content.length).toBeGreaterThan(500);
    expect(page.content).not.toContain('Navigation that should not be indexed');
  });
});
