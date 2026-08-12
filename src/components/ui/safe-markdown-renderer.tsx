"use client";
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = ['a', 'strong', 'em', 'b', 'i', 'p', 'br', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div'];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'class', 'style', 'target', 'rel'];

interface SafeMarkdownRendererProps {
  html: string;
  className?: string;
}

export function SafeMarkdownRenderer({ html, className }: SafeMarkdownRendererProps) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean as string }} />;
}
