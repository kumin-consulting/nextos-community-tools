// One dialog shell for the file switcher, the export sheet, the shortcut
// list and the shape palette: a labelled dialog, Escape to close, focus
// moved in on open and returned on close, and Tab kept inside while it is
// open. Written once so every dialog behaves the same way.

import React, { useCallback, useEffect, useRef } from 'react';
import { Icon } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  title: string;
  onClose(): void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** A short line under the title. */
  description?: string;
}

export const Modal: React.FC<ModalProps> = ({ title, description, onClose, children, footer, wide }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const firstInput = node?.querySelector<HTMLElement>('input, textarea');
    (firstInput ?? node?.querySelector<HTMLElement>(FOCUSABLE) ?? node)?.focus();
    return () => returnTo.current?.focus?.();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    },
    [onClose]
  );

  return (
    <div className="sk-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`sk-modal${wide ? ' is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="sk-modal-head">
          <div>
            <h2 className="sk-modal-title">{title}</h2>
            {description ? <p className="sk-modal-desc">{description}</p> : null}
          </div>
          <button type="button" className="sk-icon-btn" onClick={onClose} title="Close — Esc">
            <Icon name="close" />
            <span className="sk-sr">Close</span>
          </button>
        </header>
        <div className="sk-modal-body">{children}</div>
        {footer ? <footer className="sk-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
};
