export const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | undefined | null>;

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (SVGElement | null | undefined)[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

export function svgText(content: string, attrs: Attrs): SVGTextElement {
  const t = s('text', attrs);
  t.textContent = content;
  return t;
}
