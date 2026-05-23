import React, { useEffect, useRef } from 'react';
import type { FloValidationIssue } from '@floplug/shared';

export interface ValidationAlertsPanelProps {
  open: boolean;
  onClose: () => void;
  errors: FloValidationIssue[];
  warnings: FloValidationIssue[];
  onSelectNode: (nodeId: string) => void;
}

export const ValidationAlertsPanel: React.FC<ValidationAlertsPanelProps> = ({
  open, onClose, errors, warnings, onSelectNode,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  if (!open) return null;

  const total = errors.length + warnings.length;
  const groups: { title: string; color: string; items: FloValidationIssue[] }[] = [
    { title: 'Errors', color: '#f87171', items: errors },
    { title: 'Warnings', color: '#fbbf24', items: warnings },
  ];

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        width: 360,
        maxHeight: 420,
        overflowY: 'auto',
        background: '#181b24',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        zIndex: 10000,
        padding: '12px 0',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#f0f0f4' }}>
          Validation alerts ({total})
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#6b6b80', cursor: 'pointer', fontSize: 12 }}
        >
          ✕
        </button>
      </div>

      {total === 0 ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: '#6b6b80' }}>
          No validation issues on this flo.
        </div>
      ) : (
        groups.filter(g => g.items.length > 0).map(g => (
          <div key={g.title} style={{ padding: '10px 0 4px' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: g.color, padding: '0 14px 6px',
            }}>
              {g.title} ({g.items.length})
            </div>
            {g.items.map((iss, i) => (
              <button
                key={`${iss.nodeId}-${iss.code}-${i}`}
                type="button"
                onClick={() => {
                  if (iss.nodeId !== '__graph__') onSelectNode(iss.nodeId);
                  onClose();
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', border: 'none', background: 'transparent',
                  cursor: iss.nodeId === '__graph__' ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: '#e0e0e8' }}>
                  {iss.nodeLabel || iss.nodeId}
                  <span style={{ fontWeight: 400, color: '#6b6b80', marginLeft: 6 }}>{iss.nodeType}</span>
                </div>
                <div style={{ fontSize: 11, color: '#9090a0', marginTop: 3, lineHeight: 1.4 }}>
                  {iss.message}
                </div>
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
