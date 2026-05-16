import React from 'react';
import { useTheme } from '../theme/ThemeContext';

export const Section: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => {
  const t = useTheme();
  return (
    <div style={{
      background: t.sectionBg, border: `0.5px solid ${t.sectionBorder}`,
      borderRadius: 6, padding: '8px 10px', marginBottom: 10,
    }}>
      {title && (
        <div style={{
          fontSize: 9, color: t.label, textTransform: 'uppercase',
          letterSpacing: '0.4px', marginBottom: 8, fontWeight: 600,
        }}>{title}</div>
      )}
      {children}
    </div>
  );
};

export const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useTheme();
  return (
    <div style={{
      fontSize: 9, color: t.label, textTransform: 'uppercase',
      letterSpacing: '0.4px', marginBottom: 4,
    }}>{children}</div>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <FieldLabel>{label}</FieldLabel>
    {children}
  </div>
);

export const Inp: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = props => {
  const t = useTheme();
  return (
    <input {...props} style={{
      width: '100%', padding: '5px 7px', borderRadius: 4,
      border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.inputText,
      fontSize: 10, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
      ...props.style,
    }} />
  );
};

export const Sel: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = props => {
  const t = useTheme();
  return (
    <select {...props} style={{
      width: '100%', padding: '5px 7px', borderRadius: 4,
      border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.inputText,
      fontSize: 10, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
      cursor: 'pointer', ...props.style,
    }} />
  );
};

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = props => {
  const t = useTheme();
  return (
    <textarea {...props} style={{
      width: '100%', padding: '5px 7px', borderRadius: 4,
      border: `0.5px solid ${t.border}`, background: t.codeBg, color: t.codeText,
      fontSize: 10, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
      resize: 'vertical', ...props.style,
    }} />
  );
};

export const Btn: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  fullWidth?: boolean;
}> = ({ children, onClick, disabled, variant = 'primary', fullWidth }) => {
  const t = useTheme();
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: t.accent, color: '#fff', border: 'none' },
    ghost:   { background: 'rgba(255,255,255,0.04)', color: t.textSecondary, border: `0.5px solid ${t.border}` },
    danger:  { background: 'rgba(248,113,113,0.12)', color: t.danger, border: `0.5px solid rgba(248,113,113,0.3)` },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: '6px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
      opacity: disabled ? 0.5 : 1, width: fullWidth ? '100%' : undefined,
      ...styles[variant],
    }}>{children}</button>
  );
};

export const Help: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useTheme();
  return <div style={{ fontSize: 9, color: t.textMuted, lineHeight: 1.5, marginTop: 4 }}>{children}</div>;
};
