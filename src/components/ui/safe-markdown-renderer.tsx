"use client";
import React, { memo } from 'react';
import { sanitizeHtmlAllowlist } from '@/lib/security/sanitize-html-isomorphic';

const ALLOWED_TAGS = ['a', 'strong', 'em', 'b', 'i', 'p', 'br', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div'];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'class', 'style', 'target', 'rel'];

interface SafeMarkdownRendererProps {
  html: string;
  className?: string;
  as?: React.ElementType;
}

function SafeMarkdownRendererBase({ html, className, as: Component = "div" }: SafeMarkdownRendererProps) {
  const clean = sanitizeHtmlAllowlist(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  return <Component className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}

export const SafeMarkdownRenderer = memo(SafeMarkdownRendererBase);

