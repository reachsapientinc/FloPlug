/**
 * Shared binding row: source selector + value (path, static, or FloExpression).
 */

import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Field, Sel, Inp } from './ui';
import { ExpressionFieldWithLibrary } from './expression/ExpressionEditorKit';

export type BindingSourceType = 'static' | 'cStream' | 'local' | 'global' | 'expression';

const SOURCE_OPTIONS: { value: BindingSourceType; label: string }[] = [
  { value: 'static',     label: 'Static' },
  { value: 'cStream',    label: 'cStream' },
  { value: 'local',      label: 'Local' },
  { value: 'global',     label: 'Global' },
  { value: 'expression', label: 'Expression' },
];

export const BindingValueInput: React.FC<{
  label?:       string;
  hint?:        string;
  source:       BindingSourceType;
  value:        string;
  onChange:     (patch: { source: BindingSourceType; value: string }) => void;
  pathPlaceholder?: string;
  compact?:     boolean;
}> = ({
  label, hint, source, value, onChange, pathPlaceholder, compact,
}) => {
  const t = useTheme();

  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 5, flexDirection: source === 'expression' && !compact ? 'column' : 'row' }}>
        <Sel
          style={{ flex: compact ? '0 0 88px' : '0 0 100px' }}
          value={source}
          onChange={e => onChange({ source: e.target.value as BindingSourceType, value })}
        >
          {SOURCE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Sel>
        {source === 'expression' ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <ExpressionFieldWithLibrary
              value={value}
              onChange={v => onChange({ source, value: v })}
              placeholder="e.g. global.defaultToEmail or concat(cStream.a, '.', cStream.b)"
              layout="stack"
              showLibrary={!compact}
            />
          </div>
        ) : (
          <Inp
            value={value}
            placeholder={
              source === 'static'
                ? 'Literal value'
                : (pathPlaceholder ?? (source === 'global' ? 'varName or dot.path' : 'dot.path'))
            }
            onChange={e => onChange({ source, value: e.target.value })}
            style={{ flex: 1, fontFamily: source === 'static' ? undefined : 'monospace' }}
          />
        )}
      </div>
      {hint && <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>{hint}</div>}
      {source === 'global' && (
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4, fontStyle: 'italic' }}>
          Set once in a Start/Var Store node (e.g. global.defaultToEmail), reference here as <code>defaultToEmail</code>.
        </div>
      )}
    </Field>
  );
};
