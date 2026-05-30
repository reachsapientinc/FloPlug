/**
 * Row-based filter/switch conditions — table layout.
 * Default: And/Or | Field | Operator | Value (no grouping columns).
 * Optional: ( ) columns for cross-row grouping; balance is global across all rows.
 */

import React, { useMemo, useState } from 'react';
import {
  createConditionRow,
  validateConditionRowsParentheses,
  computeGlobalParenBalance,
  rowsUseGroupingColumns,
  FILTER_COMPARE_OPERATORS,
  type ConditionRow,
} from '@floplug/shared';
import { useTheme } from '../theme/ThemeContext';
import type { DesignerPalette } from '../theme/tokens';
import { Sel, Btn, Help } from './ui';
import { BindingValueInput, type BindingSourceType } from './BindingValueInput';
import { IconAdd, IconDelete } from './icons';

const OP_LABELS: Record<string, string> = {
  '==': 'equals (==)',
  '!=': 'not equals (!=)',
  '>':  'greater (>)',
  '<':  'less (<)',
  '>=': 'greater or equal (>=)',
  '<=': 'less or equal (<=)',
};

const GRID_SIMPLE = '44px minmax(100px,1.2fr) 88px minmax(100px,1.2fr) 24px';
const GRID_GROUP  = '44px 52px minmax(100px,1.2fr) 88px minmax(100px,1.2fr) 52px 24px';

export const ConditionRowsEditor: React.FC<{
  rows:     ConditionRow[];
  onChange: (rows: ConditionRow[]) => void;
  compact?: boolean;
}> = ({ rows, onChange, compact }) => {
  const t = useTheme();
  const hasStoredGrouping = useMemo(() => rowsUseGroupingColumns(rows), [rows]);
  const [showGrouping, setShowGrouping] = useState(hasStoredGrouping);
  const groupingOn = showGrouping || hasStoredGrouping;

  const parenCheck = useMemo(() => validateConditionRowsParentheses(rows), [rows]);
  const balance = useMemo(() => computeGlobalParenBalance(rows), [rows]);
  const gridCols = groupingOn ? GRID_GROUP : GRID_SIMPLE;

  const patchRow = (idx: number, patch: Partial<ConditionRow>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => onChange([...rows, createConditionRow({ logic: 'AND' })]);

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== idx));
  };

  const hideGrouping = () => {
    setShowGrouping(false);
    onChange(rows.map(r => ({ ...r, openParen: '', closeParen: '' })));
  };

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {!groupingOn ? (
          <Btn variant="ghost" onClick={() => setShowGrouping(true)}>
            Show ( ) grouping columns
          </Btn>
        ) : (
          <Btn variant="ghost" onClick={hideGrouping}>
            Hide grouping — use Expression on Field instead
          </Btn>
        )}
      </div>

      {groupingOn && (
        <GlobalParenBar balance={balance} ok={parenCheck.ok} message={parenCheck.message} />
      )}

      {!parenCheck.ok && groupingOn && (
        <div style={{
          marginBottom: 8, padding: '6px 8px', borderRadius: 5,
          background: 'rgba(248,113,113,0.12)', border: '0.5px solid rgba(248,113,113,0.4)',
          fontSize: 10, color: '#f87171',
        }}>
          {parenCheck.message}
        </div>
      )}

      <p style={{ fontSize: 9, color: t.textMuted, margin: '0 0 8px', lineHeight: 1.45 }}>
        {groupingOn
          ? '( and ) are matched across all rows in order — not per row. Row 1 may have ((, row 3 may have ), row 5 may have )).'
          : 'Simple rows: And/Or + Field + Operator + Value. For nested logic, use Field or Value source Expression, or enable grouping columns.'}
      </p>

      <div style={{ overflowX: 'auto', marginBottom: 8 }}>
        <div style={{ minWidth: groupingOn ? (compact ? 520 : 640) : (compact ? 400 : 480) }}>
          <HeaderRow t={t} grouping={groupingOn} gridCols={gridCols} />
          {rows.map((row, idx) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                gap: 6,
                alignItems: 'start',
                padding: '8px 6px',
                borderBottom: `0.5px solid ${t.border}`,
                background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              }}
            >
              <LogicCell
                isFirst={idx === 0}
                value={row.logic}
                onChange={logic => patchRow(idx, { logic })}
              />
              {groupingOn && (
                <ParenCell
                  kind="open"
                  rowNum={idx + 1}
                  value={row.openParen}
                  onChange={v => patchRow(idx, { openParen: v })}
                  invalid={!!row.openParen && !/^\(+$/.test(row.openParen)}
                />
              )}
              <BindingValueInput
                label="Field"
                hint=""
                source={(row.leftSource ?? 'cStream') as BindingSourceType}
                value={row.left}
                pathPlaceholder="e.g. cStream.status or expression"
                onChange={p => patchRow(idx, { leftSource: p.source, left: p.value })}
                compact={compact !== false && row.leftSource !== 'expression'}
              />
              <div>
                <ColLabel>Operator</ColLabel>
                <Sel
                  value={String(row.operator ?? '==')}
                  onChange={e => patchRow(idx, { operator: e.target.value })}
                  style={{ padding: '5px 4px', fontSize: 10 }}
                >
                  {FILTER_COMPARE_OPERATORS.map(o => (
                    <option key={o} value={o}>{OP_LABELS[o] ?? o}</option>
                  ))}
                </Sel>
              </div>
              <BindingValueInput
                label="Value"
                hint=""
                source={(row.rightSource ?? 'static') as BindingSourceType}
                value={row.right}
                pathPlaceholder="e.g. PAID"
                onChange={p => patchRow(idx, { rightSource: p.source, right: p.value })}
                compact={compact !== false && row.rightSource !== 'expression'}
              />
              {groupingOn && (
                <ParenCell
                  kind="close"
                  rowNum={idx + 1}
                  value={row.closeParen}
                  onChange={v => patchRow(idx, { closeParen: v })}
                  invalid={!!row.closeParen && !/^\)+$/.test(row.closeParen)}
                />
              )}
              <button
                type="button"
                title="Remove row"
                disabled={rows.length <= 1}
                onClick={() => removeRow(idx)}
                style={{
                  marginTop: 16, background: 'none', border: 'none',
                  cursor: rows.length <= 1 ? 'not-allowed' : 'pointer',
                  opacity: rows.length <= 1 ? 0.25 : 0.85, padding: 0,
                }}
              >
                <IconDelete color="#f87171" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <Btn variant="ghost" fullWidth onClick={addRow}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IconAdd /> Add condition row
        </span>
      </Btn>

      {groupingOn && (
        <Help>
          <strong>Cross-row example:</strong> row 1 open <code>(</code>, row 2 open <code>(</code>, row 3 close <code>)</code>, row 5 close <code>)</code>
          — two opens on early rows, closes on later rows. Global balance must reach 0.
        </Help>
      )}
    </div>
  );
};

function GlobalParenBar({
  balance, ok, message,
}: {
  balance: ReturnType<typeof computeGlobalParenBalance>;
  ok: boolean;
  message?: string;
}) {
  const t = useTheme();
  const { depth, totalOpen, totalClose } = balance;
  const statusColor = ok && depth === 0 ? '#22c55e' : depth > 0 ? '#f59e0b' : '#f87171';
  return (
    <div style={{
      marginBottom: 8,
      padding: '8px 10px',
      borderRadius: 6,
      border: `0.5px solid ${t.border}`,
      background: t.sectionBg,
      fontSize: 10,
      color: t.textMuted,
      lineHeight: 1.5,
    }}>
      <strong style={{ color: statusColor }}>Global ( ) balance</strong>
      {' — '}
      {totalOpen} open typed, {totalClose} close typed
      {depth > 0 && <> · <span style={{ color: '#f59e0b' }}>{depth} still open — add {depth} more ) on later rows</span></>}
      {depth < 0 && <> · <span style={{ color: '#f87171' }}>{Math.abs(depth)} too many )</span></>}
      {depth === 0 && totalOpen > 0 && <> · balanced</>}
      {!ok && message && <> · {message}</>}
    </div>
  );
}

function ColLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <div style={{
      fontSize: 8, fontWeight: 600, color: t.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.35px', marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

function HeaderRow({
  t, grouping, gridCols,
}: {
  t: DesignerPalette;
  grouping: boolean;
  gridCols: string;
}) {
  const headers = grouping
    ? ['And/Or', '(', 'Field', 'Operator', 'Value', ')', '']
    : ['And/Or', 'Field', 'Operator', 'Value', ''];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: gridCols,
      gap: 6,
      padding: '6px 6px 4px',
      borderBottom: `0.5px solid ${t.border}`,
      background: t.sectionBg,
    }}>
      {headers.map(h => (
        <div key={h || 'del'} style={{
          fontSize: 9, fontWeight: 700, color: t.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.4px',
        }}>
          {h}
        </div>
      ))}
    </div>
  );
}

function LogicCell({
  isFirst, value, onChange,
}: {
  isFirst: boolean;
  value: string;
  onChange: (v: 'AND' | 'OR') => void;
}) {
  const t = useTheme();
  if (isFirst) {
    return (
      <div style={{ paddingTop: 22 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: t.textMuted }}>And</span>
      </div>
    );
  }
  return (
    <div style={{ paddingTop: 14 }}>
      <ColLabel>And/Or</ColLabel>
      <Sel
        value={value}
        onChange={e => onChange(e.target.value as 'AND' | 'OR')}
        style={{ padding: '5px 2px', fontSize: 10 }}
      >
        <option value="AND">And</option>
        <option value="OR">Or</option>
      </Sel>
    </div>
  );
}

function sanitizeParen(raw: string, kind: 'open' | 'close'): string {
  if (kind === 'open') return raw.replace(/[^\(\[]/g, '').replace(/\[/g, '(');
  return raw.replace(/[^\)\]]/g, '').replace(/\]/g, ')');
}

function ParenCell({
  kind, rowNum, value, onChange, invalid,
}: {
  kind: 'open' | 'close';
  rowNum: number;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const t = useTheme();
  const label = kind === 'open' ? '(' : ')';

  return (
    <div>
      <ColLabel>{label}</ColLabel>
      <input
        value={value}
        onChange={e => onChange(sanitizeParen(e.target.value, kind))}
        onPaste={e => {
          e.preventDefault();
          onChange(sanitizeParen(value + e.clipboardData.getData('text'), kind));
        }}
        placeholder=""
        spellCheck={false}
        aria-label={`Row ${rowNum}: ${kind === 'open' ? 'opening' : 'closing'} parens (global balance)`}
        title={`Row ${rowNum}: add ${label} before/after this row's test. Matched across ALL rows in order.`}
        style={{
          width: '100%',
          minHeight: 28,
          padding: '5px 6px',
          textAlign: 'left',
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 12,
          letterSpacing: 2,
          border: `0.5px solid ${invalid ? '#f87171' : t.border}`,
          background: t.inputBg,
          color: t.inputText,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
        <TinyBtn title={`Add one ${label} on row ${rowNum}`} onClick={() => onChange(value + label)}>+</TinyBtn>
        <TinyBtn title="Remove one" disabled={!value.length} onClick={() => onChange(value.slice(0, -1))}>−</TinyBtn>
      </div>
    </div>
  );
}

function TinyBtn({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const t = useTheme();
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        padding: '2px 0',
        fontSize: 10,
        borderRadius: 3,
        border: `0.5px solid ${t.border}`,
        background: t.inputBg,
        color: t.textMuted,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
