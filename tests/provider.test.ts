import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.CONTENT_DIR = path.resolve('fixtures/content/minimal');
const provider = await import('../src/server/content/provider');

describe('content provider', () => {
  beforeAll(async () => {
    expect((await provider.getContent()).model).toBeDefined();
  });

  it('serves only referenced, existing assets', async () => {
    const asset = await provider.resolveAsset('lectures/01-zaklady/images/schema.png');
    expect(asset?.contentType).toBe('image/png');
    expect(asset?.body).toEqual(readFileSync(path.join(process.env.CONTENT_DIR!, 'lectures/01-zaklady/images/schema.png')));
    for (const denied of ['course.yaml', 'lectures/01-zaklady/lecture.yaml', '../package.json', 'lectures/01-zaklady/../../course.yaml', '']) {
      expect(await provider.resolveAsset(denied)).toBeUndefined();
    }
  });

  it('renders parts with protected asset URLs and image sizes', async () => {
    const { model } = await provider.getContent();
    const part = model!.lectures[0]!.parts[0]!;
    const html = await provider.getRenderedPart(part);
    expect(html).toContain('src="/obsah/lectures/01-zaklady/images/schema.png"');
    expect(html).toContain('width="2" height="2"');
  });

  it('encodes asset URLs', () => {
    expect(provider.assetUrl('lectures/a b/obrázek.png')).toBe('/obsah/lectures/a%20b/obr%C3%A1zek.png');
  });
});
