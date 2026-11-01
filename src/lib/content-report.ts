/** Visible selected text becomes an editable Markdown quote, not reconstructed source Markdown. */
export function quoteSelection(text: string): string {
  return text ? `${text.replace(/\r\n?/g, '\n').split('\n').map((line) => `> ${line}`).join('\n')}\n\n` : '';
}

export function selectedMaterialText(selection: Selection | null, materialRoot: HTMLElement): string {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return '';
  const range = selection.getRangeAt(0);
  if (!materialRoot.contains(range.startContainer) || !materialRoot.contains(range.endContainer)) return '';
  const excluded = '.exercise-panel, input, textarea, select, button, [contenteditable], [hidden], [aria-hidden="true"]';
  for (const element of materialRoot.querySelectorAll(excluded)) if (range.intersectsNode(element)) return '';
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
  const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement;
  if (start?.closest(excluded) || end?.closest(excluded)) return '';
  return selection.toString().trim();
}
