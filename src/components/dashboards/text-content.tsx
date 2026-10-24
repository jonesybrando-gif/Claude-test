import type { ReactNode } from "react";

// Text widgets: plain text with a little markdown (# headings, - bullets,
// **bold**). Rendered as React elements, never as HTML.

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong> : part));
}

export function TextContent({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length} className="whitespace-pre-line">{inline(para.join("\n"))}</p>);
    if (list.length) blocks.push(<ul key={blocks.length} className="list-disc space-y-0.5 pl-5">{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
    para = [];
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const cls = h[1].length === 1 ? "text-lg font-semibold text-text" : h[1].length === 2 ? "text-base font-semibold text-text" : "text-sm font-semibold text-text";
      blocks.push(<p key={blocks.length} className={cls}>{inline(h[2])}</p>);
    } else if (li) {
      if (para.length) { const l = list; list = []; flush(); list = l; }
      list.push(li[1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list.length) { const p = para; para = []; flush(); para = p; }
      para.push(line);
    }
  }
  flush();
  if (!blocks.length) return <p className="text-text-3">Empty text widget.</p>;
  return <div className="flex flex-col gap-2 text-sm text-text-2">{blocks}</div>;
}
