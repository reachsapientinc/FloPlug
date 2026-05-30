/**
 * Inspector widen control — grows the right panel within Designer (not over palette).
 */

import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { useInspectorPanel } from './InspectorPanelContext';
import { IconExpandPanel, IconRestorePanel } from './icons';
import { Field, Inp } from './ui';

const tbBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 6,
  cursor: 'pointer',
};

export const InspectorPanelToolbar: React.FC = () => {
  const t = useTheme();
  const { expanded, toggleExpanded, toggleVisible } = useInspectorPanel();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
      padding: '8px 10px',
      borderBottom: `0.5px solid ${t.panelBorder}`,
      flexShrink: 0,
    }}>
      <button
        type="button"
        onClick={toggleVisible}
        aria-label="Hide inspector panel"
        title="Slide panel to edge (hide)"
        style={{
          ...tbBtn,
          border: `0.5px solid ${t.border}`,
          background: t.inputBg,
          color: t.textMuted,
          fontSize: 14,
          fontFamily: 'inherit',
        }}
      >
        ›
      </button>
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={expanded ? 'Restore inspector width' : 'Expand inspector panel'}
        title={expanded
          ? 'Restore inspector width'
          : 'Expand inspector left (canvas shrinks; stops at node palette)'}
        style={{
          ...tbBtn,
          border: `0.5px solid ${expanded ? t.accent : t.border}`,
          background: expanded ? `${t.accent}18` : t.inputBg,
        }}
      >
        {expanded ? <IconRestorePanel color={t.accent} /> : <IconExpandPanel color={t.textMuted} />}
      </button>
    </div>
  );
};

/** Legacy wrapper — only renders children; expand is on the panel toolbar. */
export const InspectorExpandShell: React.FC<{
  title?:    string;
  subtitle?: string;
  children:  React.ReactNode;
}> = ({ children }) => <>{children}</>;

export const DisplayNameField: React.FC<{
  value:    string;
  onChange: (v: string) => void;
  hint?:    string;
}> = ({ value, onChange, hint }) => {
  const t = useTheme();
  return (
    <Field label="Canvas display name">
      <Inp
        value={value}
        placeholder="Label shown on the canvas card"
        onChange={e => onChange(e.target.value)}
      />
      {hint && (
        <div style={{ fontSize: 9, color: t.textMuted, lineHeight: 1.5, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </Field>
  );
};
