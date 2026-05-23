import React, { useCallback, useEffect, useState } from 'react';
import type { FloAlertDoc } from '@floplug/shared';
import { listFloAlerts } from '../api/hubApi';

export interface AlertsViewProps {
  hubId: string;
  tenantId: string;
}

export const AlertsView: React.FC<AlertsViewProps> = ({ hubId, tenantId }) => {
  const [alerts, setAlerts] = useState<FloAlertDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAlerts(await listFloAlerts(hubId, tenantId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hubId, tenantId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="view on">
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Alerts</h2>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--t3)' }}>
            Invalid or blocked flos — fix before production webhook/scheduler runs
          </p>
        </div>
        <button type="button" className="refresh-btn" onClick={load}>Refresh</button>
      </div>

      <div className="scroll-area">
        {loading && <p style={{ color: 'var(--t3)' }}>Loading alerts…</p>}
        {error && (
          <div className="error-banner">
            {error}
            <button type="button" className="refresh-btn" onClick={load} style={{ marginLeft: 12 }}>Retry</button>
          </div>
        )}
        {!loading && !error && alerts.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <p style={{ fontSize: 14, color: 'var(--t2)' }}>No active alerts</p>
            <p style={{ fontSize: 12, marginTop: 6 }}>Published flos passed validation.</p>
          </div>
        )}
        {alerts.map(a => (
          <div
            key={a.id ?? a.floId}
            className={`alert-card ${a.severity === 'critical' ? 'critical' : 'warning'}`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>{a.message}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, fontFamily: 'var(--mono)' }}>
                  flo: {a.floId}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                padding: '3px 8px', borderRadius: 4,
                background: a.severity === 'critical' ? 'var(--red-dim)' : 'var(--amber-dim)',
                color: a.severity === 'critical' ? 'var(--red)' : 'var(--amber)',
              }}>
                {a.type.replace(/_/g, ' ')}
              </span>
            </div>
            {a.issues && a.issues.length > 0 && (
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--t2)' }}>
                {a.issues.map((iss, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{iss.message}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
