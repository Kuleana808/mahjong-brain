import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('native web boot shell', () => {
  it('renders the approved brand before React hydration', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain('class="boot-shell"');
    expect(html).toContain('src="/brand-mark.png"');
    expect(html).toContain('aria-label="Opening Mahjong Brain"');
  });
});
