// src/ui/Markdown.tsx
//
// Renders the tokens lib/md.ts produces as React elements. Nothing here
// builds a string of HTML, so a deck file - which is just a text file a
// person or an agent wrote - cannot put markup into the OS's document.
//
// An image is deliberately NOT loaded: a card can reference a file by a
// relative path, and Recall shows it as a chip naming the file rather
// than trying to resolve it. Loading it would mean reading arbitrary
// paths out of the VFS into a data URL on every flip, which is a lot of
// machinery for a feature nobody asked for yet - the path is what you
// need to find the picture in Files.

import type { ReactNode } from 'react';
import { parseBlocks, parseInline } from '../lib/md';
import type { Inline } from '../lib/md';
import { ImageIcon } from './Icons';

function inlineNodes(text: string, blanks: boolean): ReactNode[] {
  return parseInline(text, { blanks }).map((token: Inline, index: number) => {
    switch (token.kind) {
      case 'strong':
        return <strong key={index}>{token.text}</strong>;
      case 'em':
        return <em key={index}>{token.text}</em>;
      case 'code':
        return <code key={index}>{token.text}</code>;
      case 'blank':
        return (
          <span key={index} className="recall-blank">
            {token.text === '...' ? '    ' : token.text}
          </span>
        );
      case 'link':
        return /^https?:\/\//i.test(token.href) ? (
          <a key={index} href={token.href} target="_blank" rel="noreferrer noopener">
            {token.text}
          </a>
        ) : (
          <span key={index} className="recall-image-link" title={token.href}>
            {token.text}
          </span>
        );
      case 'image':
        return (
          <span key={index} className="recall-image-link" title={`Image: ${token.href}`}>
            <ImageIcon size={12} />
            {token.href}
          </span>
        );
      default:
        return <span key={index}>{token.text}</span>;
    }
  });
}

/** Text with line breaks kept - a card's paragraph wraps where its
 *  author wrapped it. */
function withBreaks(text: string, blanks: boolean): ReactNode[] {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index) out.push(<br key={`br${index}`} />);
    out.push(<span key={index}>{inlineNodes(line, blanks)}</span>);
  });
  return out;
}

export function Markdown(props: { text: string; blanks?: boolean; className?: string }) {
  const blocks = parseBlocks(props.text);
  const blanks = props.blanks === true;
  return (
    <div className={`recall-md${props.className ? ` ${props.className}` : ''}`}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading': {
            const level = Math.min(3, Math.max(1, block.level));
            const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
            return <Tag key={index}>{inlineNodes(block.text, blanks)}</Tag>;
          }
          case 'code':
            return (
              <pre key={index}>
                <code>{block.text}</code>
              </pre>
            );
          case 'list':
            return block.ordered ? (
              <ol key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{withBreaks(item, blanks)}</li>
                ))}
              </ol>
            ) : (
              <ul key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{withBreaks(item, blanks)}</li>
                ))}
              </ul>
            );
          case 'quote':
            return <blockquote key={index}>{withBreaks(block.text, blanks)}</blockquote>;
          case 'rule':
            return <hr key={index} />;
          default:
            return <p key={index}>{withBreaks(block.text, blanks)}</p>;
        }
      })}
    </div>
  );
}
