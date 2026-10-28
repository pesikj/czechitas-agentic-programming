// Mermaid diagrams: drawn in the browser from the ```mermaid source, which the server renders as a
// code block (the fallback without JavaScript or when a diagram cannot be drawn). The drawing is an
// <img> with an SVG data URL: Mermaid's SVG relies on inline styles, which the site's Content
// Security Policy does not allow in the page, but an image is a separate, script-free document.
const SELECTOR = '.prose .code-block[data-kind="diagram"]';

interface Diagram {
  block: HTMLElement;
  source: string;
  image: HTMLImageElement;
  /** Came near the viewport, so it is drawn (and redrawn when the theme changes). */
  requested: boolean;
}

type Mermaid = (typeof import('mermaid/dist/mermaid.esm.min.mjs'))['default'];

const diagrams = new Map<Element, Diagram>();
let mermaid: Promise<Mermaid> | undefined;
/** Bumped when the colour theme changes; drawings started before that are discarded. */
let theme = 0;
let renders = 0;

// Mermaid is large and drawing is CPU-heavy: load it only when a diagram is about to scroll into view.
const nearby = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const diagram = diagrams.get(entry.target);
      if (!entry.isIntersecting || !diagram) continue;
      nearby.unobserve(entry.target);
      diagram.requested = true;
      void draw(diagram);
    }
  },
  { rootMargin: '400px 0px' },
);

function track(block: HTMLElement): void {
  if (diagrams.has(block)) return;
  const source = block.querySelector('code')?.textContent ?? '';
  const title = /^\s*accTitle\s*:\s*(.+)$/m.exec(source)?.[1]?.trim();
  const image = document.createElement('img');
  image.alt = title ? `Diagram: ${title}` : 'Diagram';
  image.decoding = 'async';
  diagrams.set(block, { block, source, image, requested: false });
  nearby.observe(block);
}

async function draw(diagram: Diagram): Promise<void> {
  const current = theme;
  try {
    mermaid ??= import('mermaid/dist/mermaid.esm.min.mjs').then((module) => module.default);
    const api = await mermaid;
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables(),
      // SVG text instead of HTML labels, which images do not render reliably.
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: false },
    });
    const { svg } = await api.render(`diagram-${++renders}`, diagram.source);
    if (current !== theme) return; // the theme changed meanwhile; it is redrawn in the new colours
    diagram.image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    show(diagram);
  } catch (error) {
    // Invalid diagram (or Mermaid failed to load): the source stays visible as a code block.
    console.warn('Diagram se nepodařilo vykreslit.', error);
  }
}

document.querySelectorAll<HTMLElement>(SELECTOR).forEach(track);

// Answer previews insert diagrams after the page has loaded.
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches(SELECTOR)) track(node);
      node.querySelectorAll<HTMLElement>(SELECTOR).forEach(track);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

new MutationObserver(() => {
  theme++;
  for (const [block, diagram] of diagrams) {
    if (!block.isConnected) diagrams.delete(block); // e.g. a replaced answer preview
    else if (diagram.requested) void draw(diagram);
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-webtui-theme'] });

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
