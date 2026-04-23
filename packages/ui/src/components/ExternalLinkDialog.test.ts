import { describe, expect, it } from 'vitest';
import { ExternalLinkDialog } from './ExternalLinkDialog';

describe('ExternalLinkDialog', () => {
  it('is exported as a function component', () => {
    expect(typeof ExternalLinkDialog).toBe('function');
  });

  it('accepts href and children props without throwing', () => {
    expect(() => ExternalLinkDialog({ href: 'https://example.com', children: 'Click me' })).not.toThrow();
  });

  it('handles various URL schemes', () => {
    const urls = ['https://example.com', 'mailto:user@example.com', 'http://internal.corp/docs', 'tel:+1234567890'];

    for (const url of urls) {
      expect(() => ExternalLinkDialog({ href: url, children: 'link' })).not.toThrow();
    }
  });

  it('handles empty href gracefully', () => {
    expect(() => ExternalLinkDialog({ href: '', children: 'link' })).not.toThrow();
  });
});
