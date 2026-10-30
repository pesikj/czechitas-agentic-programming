// Mermaid diagrams: drawn in the browser from the ```mermaid source, which the server renders as a
// code block (the fallback without JavaScript or when a diagram cannot be drawn). The drawing is an
// <img> with an SVG data URL: Mermaid's SVG relies on inline styles, which the site's Content
// Security Policy does not allow in the page, but an image is a separate, script-free document.
const blocks = [...document.querySelectorAll<HTMLElement>('.prose .code-block[data-kind="diagram"]')];

interface Diagram {
  block: HTMLElement;
  source: string;
  image: HTMLImageElement;
}

// Mermaid is large and drawing is CPU-heavy: load it only when a diagram is about to scroll into view.
if (blocks.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      enhance().catch((error: unknown) => console.warn('Diagramy se nepodařilo načíst.', error));
    },
    { rootMargin: '400px 0px' },
  );
  for (const block of blocks) observer.observe(block);
}

async function enhance(): Promise<void> {
  const { default: mermaid } = await import('mermaid/dist/mermaid.esm.min.mjs');
  const diagrams: Diagram[] = blocks.map((block) => {
    const source = block.querySelector('code')?.textContent ?? '';
    const title = /^\s*accTitle\s*:\s*(.+)$/m.exec(source)?.[1]?.trim();
    const image = document.createElement('img');
    image.alt = title ? `Diagram: ${title}` : 'Diagram';
    image.decoding = 'async';
    return { block, source, image };
  });

  let run = 0;
  async function drawAll(): Promise<void> {
    const current = ++run;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables(),
      // SVG text instead of HTML labels, which images do not render reliably.
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: false },
    });
    for (const [index, diagram] of diagrams.entries()) {
      try {
        const { svg } = await mermaid.render(`diagram-${index}-${current}`, diagram.source);
        if (current !== run) return; // the theme changed meanwhile; a newer run redraws
        diagram.image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        show(diagram);
      } catch (error) {
        // Invalid diagram: the source stays visible as a code block.
        console.warn('Diagram se nepodařilo vykreslit.', error);
      }
    }
  }

  await drawAll();
  new MutationObserver(() => void drawAll()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-webtui-theme'],
  });
}

/** Shows the drawing and moves the source into a collapsed "Zdrojový kód diagramu" section. */
function show({ block, image }: Diagram): void {
  if (block.dataset.rendered) return;
  const pre = block.querySelector('pre');
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Zdrojový kód diagramu';
  details.append(summary);
  if (pre) details.append(pre);
  block.append(image, details);
  block.dataset.rendered = 'true';
}

/** Mermaid colours from the site's current theme tokens. */
function themeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const background = token('--background0');
  const surface = token('--background1');
  const border = token('--background3');
  const text = token('--foreground0');
  const accent = token('--accent');
  return {
    fontFamily: token('--font-prose'),
    fontSize: token('--font-size'),
    background,
    textColor: text,
    primaryColor: surface,
    primaryTextColor: text,
    primaryBorderColor: accent,
    secondaryColor: surface,
    tertiaryColor: background,
    lineColor: token('--foreground2'),
    clusterBkg: background,
    clusterBorder: border,
    edgeLabelBackground: background,
    titleColor: text,
  };
}
