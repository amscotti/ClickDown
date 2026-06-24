// A tiny, SAFE markdown renderer for task descriptions.
//
// Security model: we HTML-escape the entire input FIRST, so any user-supplied
// HTML/tags are neutralized. Only then do we apply markdown formatting on the
// escaped text. Because the transformations only ever INSERT known-safe tags
// (<strong>, <em>, <code>, <a>, <h1..6>, <ul>, <ol>, <li>, <br>, <p>), there is
// no way for untrusted input to inject markup or attributes.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Apply inline formatting (bold, italic, code, links) to an already-escaped line.
function renderInline(line: string): string {
  // Extract inline code spans into placeholders FIRST, so bold/italic never
  // process their (literal) content. Restore them at the end.
  const codes: string[] = [];
  let out = line.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `%%CODE${codes.length - 1}%%`;
  });
  // Links: [text](http(s)://url) — only allow http(s) URLs (no javascript: scheme)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
  );
  // Bold **text** before italic *text*
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Restore code spans
  out = out.replace(/%%CODE(\d+)%%/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  return out;
}

export function renderMarkdown(input: string | null | undefined): string {
  if (!input?.trim()) return '';

  const escaped = escapeHtml(input);
  const lines = escaped.split(/\r?\n/);
  const html: string[] = [];

  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '') {
      closeLists();
      continue;
    }

    // Headings
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = heading[1]?.length ?? 1;
      html.push(
        `<h${Math.min(Math.max(level, 1), 6)}>${renderInline(heading[2] ?? '')}</h${Math.min(Math.max(level, 1), 6)}>`
      );
      continue;
    }

    // Unordered list item
    if (/^\s*[-*+]\s+/.test(line)) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${renderInline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`);
      continue;
    }

    // Ordered list item
    const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${renderInline(ol[2] ?? '')}</li>`);
      continue;
    }

    // Regular paragraph line
    closeLists();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeLists();
  return html.join('\n');
}
