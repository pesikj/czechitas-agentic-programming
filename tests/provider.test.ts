import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.CONTENT_DIR = path.resolve('fixtures/content/minimal');
const provider = await import('../src/server/content/provider');
const { FILE_EXTENSIONS, IMAGE_EXTENSIONS } = await import('../src/lib/content/validate');

describe('content provider', () => {
  beforeAll(async () => {
    expect((await provider.getContent()).model).toBeDefined();
  });

  it('serves only referenced, existing assets', async () => {
    const asset = await provider.resolveAsset('lectures/01-zaklady/images/schema.png');
    expect(asset?.contentType).toBe('image/png');
    expect(asset?.body).toEqual(readFileSync(path.join(process.env.CONTENT_DIR!, 'lectures/01-zaklady/images/schema.png')));
    for (const denied of ['course.yaml', 'lectures/01-zaklady/02-cviceni.md', 'lectures/01-zaklady/lecture.yaml', '../package.json', 'lectures/01-zaklady/../../course.yaml', '']) {
      expect(await provider.resolveAsset(denied)).toBeUndefined();
    }
  });

  it('serves linked files from subdirectories as downloads', async () => {
    const { GET } = await import('../src/pages/obsah/[...path]');
    for (const [repoPath, type, name] of [
      ['lectures/01-zaklady/soubory/prodeje.csv', 'text/csv; charset=utf-8', 'prodeje.csv'],
      ['lectures/01-zaklady/skripty/analyza.py', 'text/x-python; charset=utf-8', 'analyza.py'],
    ] as const) {
      const response = await GET({ params: { path: repoPath } } as never);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe(type);
      expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="${name}"; filename*=UTF-8''${name}`);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(readFileSync(path.join(process.env.CONTENT_DIR!, repoPath)));
    }
    const image = await GET({ params: { path: 'lectures/01-zaklady/images/schema.png' } } as never);
    expect(image.headers.get('Content-Disposition')).toBeNull();
  });

  it('has a content type for every allowed file type', () => {
    for (const extension of [...IMAGE_EXTENSIONS, ...FILE_EXTENSIONS]) expect(provider.contentTypeOf(`a${extension}`), extension).toBeDefined();
  });

  it('renders links to files with protected asset URLs', async () => {
    const { model } = await provider.getContent();
    const html = await provider.getRenderedPart(model!.lectures[0]!.parts[1]!);
    expect(html).toContain('<a href="/obsah/lectures/01-zaklady/soubory/prodeje.csv">data o prodejích</a>');
    expect(html).toContain('<a href="/obsah/lectures/01-zaklady/skripty/analyza.py">skript</a>');
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
