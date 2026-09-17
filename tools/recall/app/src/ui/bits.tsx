// src/ui/bits.tsx
//
// The handful of primitives every screen is built from. They exist so
// that a button is the same button everywhere, and so that every dialog
// traps focus, closes on Escape and returns focus to whatever opened it
// without each screen having to remember to do that.

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { CloseIcon } from './Icons';

/* ---------------------------------------------------------- buttons */

export function Button(props: {
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  autoFocus?: boolean;
  'aria-label'?: string;
}) {
  const { children, onClick, variant = 'default', disabled, title, type = 'button', autoFocus } = props;
  return (
    <button
      type={type}
      className="recall-btn"
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
      title={title}
      autoFocus={autoFocus}
      aria-label={props['aria-label']}
    >
      {children}
    </button>
  );
}

export function IconButton(props: { children: ReactNode; label: string; onClick?: () => void; disabled?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      className="recall-icon-btn"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed}
    >
      {props.children}
    </button>
  );
}

/* ----------------------------------------------------------- fields */

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const child =
    isValidElement(props.children) && (props.children as ReactElement<{ id?: string }>).props.id === undefined
      ? cloneElement(props.children as ReactElement<{ id?: string }>, { id })
      : props.children;
  return (
    <div className="recall-field">
      <label htmlFor={id}>{props.label}</label>
      <div>{child}</div>
      {props.hint ? <small>{props.hint}</small> : null}
    </div>
  );
}

export function TextInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  label?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  type?: string;
  id?: string;
}) {
  return (
    <input
      id={props.id}
      className="recall-input"
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.label}
      autoFocus={props.autoFocus}
      onChange={(event) => props.onChange(event.target.value)}
      onKeyDown={props.onKeyDown}
    />
  );
}

export function NumberInput(props: { value: number; onChange: (value: number) => void; min?: number; max?: number; id?: string; label?: string }) {
  return (
    <input
      id={props.id}
      className="recall-input"
      type="number"
      value={String(props.value)}
      min={props.min}
      max={props.max}
      aria-label={props.label}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) props.onChange(next);
      }}
    />
  );
}

export function Checkbox(props: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="recall-check">
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span>
        <span style={{ fontWeight: 500 }}>{props.label}</span>
        {props.hint ? (
          <>
            <br />
            <small className="recall-muted">{props.hint}</small>
          </>
        ) : null}
      </span>
    </label>
  );
}

export function Select<T extends string>(props: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string }>; label?: string; id?: string }) {
  return (
    <select
      id={props.id}
      className="recall-select"
      value={props.value}
      aria-label={props.label}
      onChange={(event) => props.onChange(event.target.value as T)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* ----------------------------------------------------------- modals */

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    return () => {
      const back = returnTo.current;
      if (back instanceof HTMLElement) back.focus();
    };
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = ref.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>('input, textarea, select, button, [tabindex]:not([tabindex="-1"])')).filter(
        (el) => !el.hasAttribute('disabled')
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    },
    [props]
  );

  return (
    <div
      className="recall-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        className="recall-modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        ref={ref}
        onKeyDown={onKeyDown}
        style={props.wide ? { maxWidth: 720 } : undefined}
      >
        <div className="recall-modal-head">
          <h2 className="recall-modal-title">{props.title}</h2>
          <IconButton label="Close" onClick={props.onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        <div className="recall-modal-body">{props.children}</div>
        {props.footer ? <div className="recall-modal-foot">{props.footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ misc */

export function Pill(props: { kind?: 'new' | 'learning' | 'review'; children: ReactNode; title?: string }) {
  return (
    <span className="recall-pill" data-kind={props.kind} title={props.title}>
      {props.children}
    </span>
  );
}

export function Empty(props: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="recall-empty">
      <div className="recall-empty-art">{props.icon}</div>
      <h2>{props.title}</h2>
      {props.children}
    </div>
  );
}
