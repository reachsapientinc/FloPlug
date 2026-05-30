/**
 * Mapper node inspector — FloExpression rows + function library.
 * Compact sidebar + optional full-screen expanded editor (Esc to close).
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { NodeInspectorProps } from './types';
import { Field, Sel, Btn, Help } from './ui';
import { useTheme } from '../theme/ThemeContext';
import {
  ExpressionInsertProvider,
  ExpressionTextarea,
  FunctionLibraryPanel,
  expressionSyntaxError,
} from './expression/ExpressionEditorKit';

interface Pair { expr: string; tgt: string; }

type MapperLayout = 'compact' | 'expanded';

const SCROLL_CLASS = 'fp-mapper-scroll';

function parseMappings(raw: string[]): Pair[] {
  return raw.map(m => {
    const arrowMatch = m.match(/^(.*?)(?:→|->|=>)(.*)$/);
    if (!arrowMatch) return { expr: m.trim(), tgt: '' };
    return { expr: arrowMatch[1].trim(), tgt: arrowMatch[2].trim() };
  });
}

function serialiseMappings(pairs: Pair[]): string[] {
  return pairs.map(p => `${p.expr} → ${p.tgt}`);
}

function MapperRulesEditor({
  layout,
  pairs,
  activeRow,
  setActiveRow,
  commit,
  mapMode,
  onMapModeChange,
  accent,
  t,
}: {
  layout:         MapperLayout;
  pairs:          Pair[];
  activeRow:      number | null;
  setActiveRow:   (i: number | null) => void;
  commit:         (next: Pair[]) => void;
  mapMode:        string;
  onMapModeChange: (mode: string) => void;
  accent:         string;
  t:              ReturnType<typeof useTheme>;
}) {
  const expanded = layout === 'expanded';
  const inpStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: expanded ? '8px 10px' : '5px 7px',
    borderRadius: 6, border: `0.5px solid ${t.border}`, background: t.inputBg,
    color: t.inputText, fontSize: expanded ? 12 : 10, fontFamily: 'monospace', outline: 'none',
  };

  return (
    <ExpressionInsertProvider>
      <div style={{
        display: 'flex',
        flexDirection: expanded ? 'row' : 'column',
        gap: 0,
        border: `0.5px solid ${t.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        flex: expanded ? 1 : undefined,
        minHeight: expanded ? 0 : undefined,
      }}>
        <div
          className={SCROLL_CLASS}
          style={{
            flex: 1,
            minWidth: 0,
            padding: expanded ? '14px 16px' : '10px 12px',
            maxHeight: expanded ? undefined : 360,
            overflowY: 'scroll',
            overflowX: 'auto',
          }}
        >
          {expanded && (
            <Field label="Mode">
              <Sel value={mapMode} onChange={e => onMapModeChange(e.target.value)}>
                <option value="pure">Pure — output only mapped fields</option>
                <option value="transform">Transform — keep unmapped fields</option>
              </Sel>
            </Field>
          )}
          {pairs.map((pair, i) => {
            const err = expressionSyntaxError(pair.expr);
            const focused = activeRow === i;
            return (
              <div
                key={i}
                style={{
                  border: `0.5px solid ${focused ? accent : t.border}`,
                  borderRadius: 6,
                  marginBottom: expanded ? 10 : 8,
                  overflow: 'hidden',
                }}
                onMouseDown={() => setActiveRow(i)}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: expanded ? '8px 11px' : '5px 9px',
                  background: t.sectionBg,
                  borderBottom: `0.5px solid ${t.border}`,
                }}>
                  <span style={{ fontSize: expanded ? 12 : 10, color: t.textMuted }}>
                    Rule {i + 1}
                    {focused && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 3,
                        background: `${accent}14`, border: `0.5px solid ${accent}44`,
                        color: accent, fontWeight: 600,
                      }}>active</span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!err && pair.expr.trim() && <span style={{ fontSize: 10, color: '#22c55e' }}>✓</span>}
                    <button
                      type="button"
                      onClick={() => commit(pairs.filter((_, idx) => idx !== i))}
                      style={{
                        background: 'none', border: 'none', color: t.textMuted,
                        cursor: 'pointer', fontSize: 13,
                      }}
                    >×</button>
                  </div>
                </div>
                <div style={{ padding: expanded ? '10px 11px' : '8px 9px' }}>
                  <ExpressionTextarea
                    value={pair.expr}
                    onChange={expr => commit(pairs.map((p, idx) => idx === i ? { ...p, expr } : p))}
                    placeholder="e.g. concat(cStream.first, ' ', cStream.last)"
                    rows={expanded ? 3 : 2}
                    syntaxError={err}
                    showCursorPos={expanded}
                    active={focused}
                    onFocusActive={() => setActiveRow(i)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ color: accent, fontSize: 11, fontFamily: 'monospace' }}>→</span>
                    <input
                      value={pair.tgt}
                      placeholder="target.path"
                      style={inpStyle}
                      onChange={e => commit(pairs.map((p, idx) => idx === i ? { ...p, tgt: e.target.value } : p))}
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <Btn variant="ghost" fullWidth onClick={() => commit([...pairs, { expr: '', tgt: '' }])}>
            + Add mapping rule
          </Btn>
        </div>
        <FunctionLibraryPanel layout="sidebar" width={expanded ? 220 : undefined} />
      </div>
    </ExpressionInsertProvider>
  );
}

export const MapperInspectorCore: React.FC<NodeInspectorProps> = ({ node, onUpdate }) => {
  const t = useTheme();
  const d = node.data as Record<string, unknown>;
  const raw = (d.mappings as string[]) ?? [];
  const mapMode = String(d.mapMode ?? 'pure');

  const [pairs, setPairs] = useState<Pair[]>(() => parseMappings(raw));
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [expandedOpen, setExpandedOpen] = useState(false);

  const accent = t.accent ?? '#7c3aed';

  const commit = (next: Pair[]) => {
    const invalid = next.find(p => p.expr.trim() && expressionSyntaxError(p.expr));
    setPairs(next);
    if (invalid) return;
    onUpdate(node.id, { mappings: serialiseMappings(next) });
  };

  useEffect(() => {
    setPairs(parseMappings((node.data as Record<string, unknown>).mappings as string[] ?? []));
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expandedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedOpen]);

  const editorProps = {
    pairs,
    activeRow,
    setActiveRow,
    commit,
    mapMode,
    onMapModeChange: (mode: string) => onUpdate(node.id, { mapMode: mode }),
    accent,
    t,
  };

  const scrollCss = `
    .${SCROLL_CLASS} { overflow-y: scroll; overflow-x: auto; scrollbar-width: thin; }
    .${SCROLL_CLASS}::-webkit-scrollbar { width: 10px; height: 10px; }
    .${SCROLL_CLASS}::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.5); border-radius: 5px; }
  `;

  const expandedModal = expandedOpen ? createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expanded mapper"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) setExpandedOpen(false); }}
    >
      <style>{scrollCss}</style>
      <div
        style={{
          flex: 1, maxWidth: 1680,
          background: '#12151c',
          border: '0.5px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6' }}>Field mapper</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {pairs.length} rule(s) · Esc or × to close
            </div>
          </div>
          <Btn variant="ghost" onClick={() => setExpandedOpen(false)}>Close</Btn>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: '14px 18px 18px', display: 'flex', flexDirection: 'column' }}>
          <MapperRulesEditor layout="expanded" {...editorProps} />
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <Field label="Mode">
        <Sel value={mapMode} onChange={e => onUpdate(node.id, { mapMode: e.target.value })}>
          <option value="pure">Pure — output only mapped fields</option>
          <option value="transform">Transform — keep unmapped fields</option>
        </Sel>
      </Field>

      <Help>
        FloExpression on each rule (not <code>{'{{ }}'}</code>). Open expanded view for a larger editor and function library.
      </Help>

      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Btn variant="primary" fullWidth onClick={() => setExpandedOpen(true)}>
          Open expanded mapper
        </Btn>
      </div>

      <style>{scrollCss}</style>
      <MapperRulesEditor layout="compact" {...editorProps} />
      {expandedModal}
    </>
  );
};
