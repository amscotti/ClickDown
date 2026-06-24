import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from '../../src/utils/markdown';

describe('Markdown renderer', () => {
  test('returns empty string for empty / whitespace input', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown('   \n  ')).toBe('');
  });

  test('renders paragraphs', () => {
    expect(renderMarkdown('Hello world')).toBe('<p>Hello world</p>');
  });

  test('renders bold and italic', () => {
    expect(renderMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>');
    expect(renderMarkdown('*italic*')).toBe('<p><em>italic</em></p>');
    expect(renderMarkdown('a **b** and *c*')).toBe('<p>a <strong>b</strong> and <em>c</em></p>');
  });

  test('renders inline code without further formatting inside', () => {
    expect(renderMarkdown('use `**not bold**` here')).toBe(
      '<p>use <code>**not bold**</code> here</p>'
    );
  });

  test('renders http(s) links and rejects other schemes', () => {
    expect(renderMarkdown('[click](https://example.com)')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a></p>'
    );
    // javascript: scheme must NOT be turned into a link
    const dangerous = renderMarkdown('[x](javascript:alert(1))');
    expect(dangerous).not.toContain('href="javascript');
  });

  test('renders headings h1-h6', () => {
    expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>');
    expect(renderMarkdown('### Sub')).toBe('<h3>Sub</h3>');
  });

  test('renders unordered and ordered lists', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    expect(renderMarkdown('1. first\n2. second')).toBe(
      '<ol>\n<li>first</li>\n<li>second</li>\n</ol>'
    );
  });

  test('ESCAPES raw HTML to prevent XSS (script tag)', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  test('escapes attribute-injection attempts', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  test('escapes HTML even when combined with markdown syntax', () => {
    // Bold marker applied, but injected tag stays escaped
    const out = renderMarkdown('**<b>hi</b>**');
    expect(out).toContain('<strong>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).not.toContain('<b>hi</b>');
  });
});

test('renders all heading levels h4-h6', () => {
  expect(renderMarkdown('#### h4')).toBe('<h4>h4</h4>');
  expect(renderMarkdown('##### h5')).toBe('<h5>h5</h5>');
  expect(renderMarkdown('###### h6')).toBe('<h6>h6</h6>');
});

test('renders ordered lists with sequential numbers', () => {
  const out = renderMarkdown('1. first\n2. second\n3. third');
  expect(out).toContain('<ol>');
  expect(out).toContain('<li>first</li>');
  expect(out).toContain('<li>third</li>');
});
