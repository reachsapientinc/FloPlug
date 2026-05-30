/**
 * FloExpression Designer UX — function library, right-click insert, placeholder dialog.
 * Matches files/mapper_context_menu_insertion.html mockup.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../theme/ThemeContext';
import { validateFloExpression, structuralExpressionCheck } from '@floplug/shared';
import {
  FLO_EXPR_CATEGORIES,
  FLO_EXPR_FUNCTIONS,
  buildFnCall,
  insertAtCursor,
  paramPlaceholder,
  type FloExprFn,
  type FloExprCategory,
} from './floExpressionCatalog';
import { getFrequentFloExprFnNames, recordFloExprFnUsage } from './floExpressionFrequent';

export function expressionSyntaxError(expr: string): string | null {
  if (!expr.trim()) return null;
  const structural = structuralExpressionCheck(expr);
  if (structural) return structural;
  const v = validateFloExpression(expr);
  if (v.ok) return null;
  return v.ok === false ? v.message : null;
}

// ── Insert session (shared library + context menu + placeholder dialog) ────────

interface InsertSession {
  ta:       HTMLTextAreaElement;
  selStart: number;
  selEnd:   number;
  onInserted: (newValue: string) => void;
}

interface InsertCtxValue {
  session:        InsertSession | null;
  setSession:     (s: InsertSession | null) => void;
  focused:        boolean;
  setFocused:     (v: boolean) => void;
}

const InsertCtx = React.createContext<InsertCtxValue | null>(null);

let _openCtxMenu: ((x: number, y: number) => void) | null = null;
let _beginInsert: ((fn: FloExprFn, anchor?: DOMRect) => void) | null = null;

export const ExpressionInsertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<InsertSession | null>(null);
  const [focused, setFocused] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; cat: FloExprCategory } | null>(null);
  const [phFn, setPhFn] = useState<FloExprFn | null>(null);
  const [phAnchor, setPhAnchor] = useState<DOMRect | null>(null);
  const t = useTheme();
  const accent = t.accent ?? '#7c3aed';

  const closeAll = useCallback(() => {
    setCtxMenu(null);
    setPhFn(null);
    setPhAnchor(null);
  }, []);

  const beginInsert = useCallback((fn: FloExprFn, anchor?: DOMRect) => {
    if (!session) return;
    setCtxMenu(null);
    setPhFn(fn);
    setPhAnchor(anchor ?? session.ta.getBoundingClientRect());
  }, [session]);

  const commitCall = useCallback((fn: FloExprFn, vals: Record<string, string>) => {
    if (!session) return;
    const call = buildFnCall(fn, vals);
    insertAtCursor(session.ta, call, session.selStart, session.selEnd);
    recordFloExprFnUsage(fn.name);
    session.onInserted(session.ta.value);
    closeAll();
  }, [session, closeAll]);

  useEffect(() => {
    _openCtxMenu = (x, y) => setCtxMenu({ x, y, cat: 'Frequent' });
    _beginInsert = beginInsert;
    return () => { _openCtxMenu = null; _beginInsert = null; };
  }, [beginInsert]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest?.('[data-flo-expr-ctx]') || el.closest?.('[data-flo-expr-ph]')) return;
      setCtxMenu(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [closeAll]);

  const frequentNames = useMemo(() => getFrequentFloExprFnNames(), [ctxMenu, phFn, session]);

  const filterFns = (cat: FloExprCategory): FloExprFn[] => {
    if (cat === 'Frequent') {
      const list: FloExprFn[] = [];
      const seen = new Set<string>();
      for (const name of frequentNames) {
        const f = FLO_EXPR_FUNCTIONS.find(x => x.name === name);
        if (f && !seen.has(f.name)) { seen.add(f.name); list.push(f); }
      }
      return list;
    }
    if (cat === 'All') return FLO_EXPR_FUNCTIONS;
    if (cat === 'Format') return FLO_EXPR_FUNCTIONS.filter(f => f.cat === 'Format' || f.name === 'format');
    return FLO_EXPR_FUNCTIONS.filter(f => f.cat === cat);
  };

  const ctxPortal = ctxMenu && session ? createPortal(
    <div data-flo-expr-ctx style={{
      position: 'fixed', left: Math.min(ctxMenu.x, window.innerWidth - 250),
      top: Math.min(ctxMenu.y, window.innerHeight - 400), zIndex: 10000, minWidth: 230,
      background: t.panel ?? t.inputBg, border: `0.5px solid ${t.border}`, borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.45)', overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 11px', borderBottom: `0.5px solid ${t.border}`, background: t.sectionBg }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.label }}>INSERT FUNCTION</div>
        <div style={{ fontSize: 10, color: t.textMuted }}>
          {session.ta.value.slice(session.selStart, session.selEnd).trim() ? 'wrap selection' : `at cursor (pos ${session.selStart})`}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: '6px 8px', borderBottom: `0.5px solid ${t.border}` }}>
        {FLO_EXPR_CATEGORIES.map(c => (
          <button key={c} type="button" onClick={() => setCtxMenu(m => m ? { ...m, cat: c } : null)}
            style={{
              padding: '2px 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
              border: `0.5px solid ${ctxMenu.cat === c ? accent : t.border}`,
              background: ctxMenu.cat === c ? `${accent}18` : 'transparent',
              color: ctxMenu.cat === c ? accent : t.textSecondary,
              fontWeight: ctxMenu.cat === c ? 600 : 400,
            }}>{c}</button>
        ))}
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {filterFns(ctxMenu.cat).map(f => (
          <button key={`${f.name}-${f.cat}`} type="button" onClick={() => beginInsert(f)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 11px', cursor: 'pointer',
              border: 'none', borderBottom: `0.5px solid ${t.border}`, background: 'transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${accent}0c`; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: accent, fontFamily: 'monospace' }}>{f.name}</div>
            <div style={{ fontSize: 10, color: t.textSecondary, fontFamily: 'monospace' }}>{f.sig}</div>
            <div style={{ fontSize: 10, color: t.textMuted }}>{f.desc}</div>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  ) : null;

  const phPortal = phFn && session && phAnchor ? createPortal(
    <PlaceholderDialog fn={phFn} selectedText={session.ta.value.slice(session.selStart, session.selEnd).trim()}
      anchor={phAnchor} accent={accent} onCancel={closeAll} onInsert={vals => commitCall(phFn, vals)} />,
    document.body,
  ) : null;

  return (
    <InsertCtx.Provider value={{ session, setSession, focused, setFocused }}>
      {children}
      {ctxPortal}
      {phPortal}
    </InsertCtx.Provider>
  );
};

const PlaceholderDialog: React.FC<{
  fn: FloExprFn;
  selectedText: string;
  anchor: DOMRect;
  accent: string;
  onCancel: () => void;
  onInsert: (vals: Record<string, string>) => void;
}> = ({ fn, selectedText, anchor, accent, onCancel, onInsert }) => {
  const t = useTheme();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fn.params.forEach((p, i) => { if (i === 0 && selectedText) init[p.n] = selectedText; });
    return init;
  });
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const ttW = 240;
  const ttH = 48 + fn.params.length * 56;
  let tx = anchor.right + 8;
  let ty = anchor.top;
  if (tx + ttW > window.innerWidth - 8) tx = anchor.left - ttW - 8;
  if (ty + ttH > window.innerHeight - 8) ty = window.innerHeight - ttH - 8;

  return (
    <div data-flo-expr-ph style={{
      position: 'fixed', left: Math.max(8, tx), top: Math.max(8, ty), zIndex: 10001,
      minWidth: 220, background: t.panel ?? t.inputBg, border: `0.5px solid ${accent}`,
      borderRadius: 8, padding: '10px 12px', boxShadow: '0 8px 32px rgba(0,0,0,.5)',
    }}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onInsert(vals); } }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: accent, fontFamily: 'monospace', marginBottom: 8 }}>{fn.sig}</div>
      {fn.params.map((p, i) => (
        <div key={p.n} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: t.textSecondary, fontFamily: 'monospace' }}>
            {p.n}{p.opt ? ' (optional)' : ''}
          </div>
          {p.note && <div style={{ fontSize: 9, color: t.textMuted, fontStyle: 'italic' }}>{p.note}</div>}
          <input
            ref={i === 0 ? firstRef : undefined}
            className="ph-tt-inp"
            value={vals[p.n] ?? ''}
            onChange={e => setVals(v => ({ ...v, [p.n]: e.target.value }))}
            placeholder={paramPlaceholder(p)}
            style={{
              width: '100%', marginTop: 2, fontSize: 10, fontFamily: 'monospace', padding: '3px 6px',
              borderRadius: 4, border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.inputText,
            }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={{
          padding: '3px 9px', fontSize: 10, background: 'transparent', border: `0.5px solid ${t.border}`,
          borderRadius: 4, cursor: 'pointer', color: t.textSecondary,
        }}>Cancel</button>
        <button type="button" onClick={() => onInsert(vals)} style={{
          padding: '3px 10px', fontSize: 10, background: accent, border: 'none', borderRadius: 4,
          cursor: 'pointer', color: '#fff', fontWeight: 600,
        }}>Insert</button>
      </div>
    </div>
  );
};

// ── Expression textarea ────────────────────────────────────────────────────────

export const ExpressionTextarea: React.FC<{
  value:            string;
  onChange:         (value: string) => void;
  onBlur?:          () => void;
  placeholder?:     string;
  rows?:            number;
  syntaxError?:     string | null;
  showCursorPos?:  boolean;
  active?:          boolean;
  onFocusActive?:   () => void;
}> = ({
  value, onChange, onBlur, placeholder, rows = 2, syntaxError, showCursorPos, active, onFocusActive,
}) => {
  const t = useTheme();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const ctx = React.useContext(InsertCtx);
  const [cursorPos, setCursorPos] = useState(0);

  const syncSession = () => {
    const ta = taRef.current;
    if (!ta || !ctx) return;
    ctx.setSession({
      ta,
      selStart: ta.selectionStart ?? 0,
      selEnd:   ta.selectionEnd ?? 0,
      onInserted: onChange,
    });
  };

  const autoSize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 32)}px`;
  };

  const hasErr = Boolean(syntaxError && value.trim());

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        fontSize: 9, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.4,
        marginBottom: 4, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>Expression</span>
        <span style={{ fontStyle: 'italic', textTransform: 'none' }}>right-click to insert function</span>
      </div>
      <textarea
        ref={taRef}
        value={value}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        onChange={e => {
          autoSize(e.target);
          onChange(e.target.value);
          setCursorPos(e.target.selectionStart ?? 0);
        }}
        onFocus={e => {
          autoSize(e.target);
          onFocusActive?.();
          ctx?.setFocused(true);
          syncSession();
        }}
        onClick={e => {
          setCursorPos(e.currentTarget.selectionStart ?? 0);
          syncSession();
        }}
        onKeyUp={e => {
          setCursorPos(e.currentTarget.selectionStart ?? 0);
          syncSession();
        }}
        onBlur={() => {
          ctx?.setFocused(false);
          onBlur?.();
        }}
        onContextMenu={e => {
          e.preventDefault();
          syncSession();
          onFocusActive?.();
          _openCtxMenu?.(e.clientX, e.clientY);
        }}
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: 11, fontFamily: 'monospace',
          color: t.codeText ?? t.inputText, background: t.codeBg ?? t.inputBg,
          border: `0.5px solid ${hasErr ? '#dc2626' : active ? (t.accent ?? '#7c3aed') : t.border}`,
          borderRadius: 5, padding: '6px 8px', outline: 'none', resize: 'none', lineHeight: 1.6,
          minHeight: 32,
        }}
      />
      {showCursorPos && (
        <div style={{
          position: 'absolute', right: 8, bottom: 6, fontSize: 9, color: t.textMuted,
          fontFamily: 'monospace', pointerEvents: 'none', background: t.inputBg, padding: '0 3px', borderRadius: 3,
        }}>
          pos: {cursorPos}
        </div>
      )}
      {hasErr && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>⚠ {syntaxError}</div>}
    </div>
  );
};

// ── Function library sidebar / panel ───────────────────────────────────────────

export const FunctionLibraryPanel: React.FC<{
  layout?: 'sidebar' | 'stack';
  width?:  number;
}> = ({ layout = 'sidebar', width = 198 }) => {
  const t = useTheme();
  const ctx = React.useContext(InsertCtx);
  const [activeCat, setActiveCat] = useState<FloExprCategory>('Frequent');
  const accent = t.accent ?? '#7c3aed';
  const frequentNames = useMemo(() => getFrequentFloExprFnNames(), []);

  const list = useMemo(() => {
    if (activeCat === 'Frequent') {
      const out: FloExprFn[] = [];
      const seen = new Set<string>();
      for (const name of frequentNames) {
        const f = FLO_EXPR_FUNCTIONS.find(x => x.name === name);
        if (f && !seen.has(f.name)) { seen.add(f.name); out.push(f); }
      }
      return out;
    }
    if (activeCat === 'All') return FLO_EXPR_FUNCTIONS;
    if (activeCat === 'Format') return FLO_EXPR_FUNCTIONS.filter(f => f.cat === 'Format' || f.name === 'format');
    return FLO_EXPR_FUNCTIONS.filter(f => f.cat === activeCat);
  }, [activeCat, frequentNames]);

  const panelStyle: React.CSSProperties = layout === 'sidebar'
    ? { width, flexShrink: 0, display: 'flex', flexDirection: 'column', background: t.sectionBg, borderLeft: `0.5px solid ${t.border}` }
    : { display: 'flex', flexDirection: 'column', background: t.sectionBg, border: `0.5px solid ${t.border}`, borderRadius: 8, marginTop: 8, maxHeight: 280 };

  return (
    <div style={panelStyle}>
      <div style={{ padding: '9px 10px 7px', borderBottom: `0.5px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: t.label, marginBottom: 6 }}>
          Functions <span style={{ fontSize: 9, fontWeight: 400, color: t.textMuted, fontStyle: 'italic' }}>click insert</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {FLO_EXPR_CATEGORIES.map(c => (
            <button key={c} type="button" onClick={() => setActiveCat(c)}
              style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: `0.5px solid ${activeCat === c ? accent : t.border}`,
                background: activeCat === c ? `${accent}14` : 'transparent',
                color: activeCat === c ? accent : t.textSecondary,
                fontWeight: activeCat === c ? 600 : 400,
              }}>{c}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '7px 8px' }}>
        {!ctx?.focused && (
          <div style={{
            fontSize: 10, color: '#f59e0b', padding: '6px 8px', marginBottom: 6, borderRadius: 5,
            border: '0.5px dashed #f59e0b44', background: '#f59e0b10',
          }}>
            Focus an expression field first
          </div>
        )}
        {list.map(f => (
          <div
            key={`${f.name}-${f.cat}`}
            style={{
              padding: '7px 8px', borderRadius: 5, marginBottom: 5, cursor: ctx?.session ? 'pointer' : 'default',
              border: `0.5px solid ${t.border}`, background: t.panel ?? t.inputBg, position: 'relative',
              opacity: ctx?.session ? 1 : 0.55,
            }}
            onMouseEnter={e => { if (ctx?.session) e.currentTarget.style.borderColor = accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; }}
            onClick={e => {
              if (!ctx?.session) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              _beginInsert?.(f, rect);
            }}
          >
            <button
              type="button"
              onClick={ev => {
                ev.stopPropagation();
                if (!ctx?.session) return;
                const rect = (ev.currentTarget as HTMLButtonElement).getBoundingClientRect();
                _beginInsert?.(f, rect);
              }}
              style={{
                position: 'absolute', right: 6, top: 6, fontSize: 9, padding: '2px 6px', borderRadius: 4,
                border: `0.5px solid ${accent}`, background: `${accent}14`, color: accent, cursor: 'pointer',
                fontFamily: 'inherit', display: ctx?.session ? 'block' : 'none',
              }}
            >insert</button>
            <div style={{ fontSize: 11, fontWeight: 600, color: accent, fontFamily: 'monospace' }}>{f.name}</div>
            <div style={{ fontSize: 10, color: t.textSecondary, fontFamily: 'monospace', lineHeight: 1.4 }}>{f.sig}</div>
            <div style={{ fontSize: 10, color: t.textMuted }}>{f.desc}</div>
          </div>
        ))}
        <div style={{
          fontSize: 10, color: t.textMuted, padding: 8, textAlign: 'center', marginTop: 4,
          border: `0.5px dashed ${t.border}`, borderRadius: 5, lineHeight: 1.5,
        }}>
          <strong style={{ display: 'block', marginBottom: 3 }}>Two ways to insert</strong>
          Click <strong>insert</strong> on a function, or right-click inside the expression field.
        </div>
      </div>
    </div>
  );
};

/** Split editor + library (mockup layout) — wrap mapping rows + library in one provider */
export const ExpressionWorkspace: React.FC<{
  layout:   'split' | 'stack';
  children: React.ReactNode;
  libWidth?: number;
}> = ({ layout, children, libWidth }) => (
  <ExpressionInsertProvider>
    <div style={{
      display: 'flex',
      flexDirection: layout === 'split' ? 'row' : 'column',
      border: `0.5px solid transparent`,
      borderRadius: 8,
      overflow: 'hidden',
      minHeight: layout === 'split' ? 320 : undefined,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <FunctionLibraryPanel layout={layout === 'split' ? 'sidebar' : 'stack'} width={libWidth} />
    </div>
  </ExpressionInsertProvider>
);

/** Single expression field + optional stacked library */
export const ExpressionFieldWithLibrary: React.FC<{
  value:        string;
  onChange:     (value: string) => void;
  onBlur?:      () => void;
  placeholder?: string;
  rows?:        number;
  layout?:      'stack' | 'inline';
  showLibrary?: boolean;
}> = ({ value, onChange, onBlur, placeholder, rows = 2, layout = 'stack', showLibrary = true }) => {
  const err = expressionSyntaxError(value);
  const [active, setActive] = useState(false);

  return (
    <ExpressionInsertProvider>
      <ExpressionTextarea
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        syntaxError={err}
        showCursorPos
        active={active}
        onFocusActive={() => setActive(true)}
      />
      {showLibrary && layout === 'stack' && <FunctionLibraryPanel layout="stack" />}
    </ExpressionInsertProvider>
  );
};
