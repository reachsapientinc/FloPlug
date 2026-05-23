/**
 * Flo Alerts — invalidated / blocked flos for Execution Hub.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FloAlertDoc } from '@floplug/shared';

export interface FloAlertsSectionProps {
  hubId:    string;
  tenantId: string;
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: 10,
  padding: '14px 16px',
  marginBottom: 10,
};

export const FloAlertsSection: React.FC<FloAlertsSectionProps> = ({ hubId, tenantId }) => {
  const [alerts, setAlerts]     = useState<FloAlertDoc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable<
        { hubId: string; tenantId: string; includeResolved?: boolean },
        { alerts: FloAlertDoc[] }
      >(getFunctions(), 'getFloAlerts');
      const { data } = await fn({ hubId, tenantId, includeResolved: false });
      setAlerts(data.alerts ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hubId, tenantId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <p style={{ color: '#6B7280', fontSize: 13 }}>Loading alerts…</p>;
  }
  if (error) {
    return (
      <div style={{ color: '#DC2626', fontSize: 13 }}>
        Failed to load alerts: {error}
        <button type="button" onClick={load} style={{ marginLeft: 12, fontSize: 12 }}>Retry</button>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: '#6B7280' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>No active alerts</p>
        <p style={{ fontSize: 12, marginTop: 6 }}>Published flos passed validation. Background checks run every 6 hours.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#374151' }}>
          {alerts.length} active alert{alerts.length === 1 ? '' : 's'}
        </span>
        <button type="button" onClick={load} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>
      {alerts.map(a => (
        <div key={a.id ?? a.floId} style={{
          ...card,
          borderLeft: a.severity === 'critical' ? '4px solid #DC2626' : '4px solid #F59E0B',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{a.title}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{a.message}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, fontFamily: 'monospace' }}>
                flo: {a.floId}
                {a.errorCount != null ? ` · ${a.errorCount} error(s)` : ''}
                {a.warningCount != null ? ` · ${a.warningCount} warning(s)` : ''}
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: 4,
              background: a.severity === 'critical' ? '#FEE2E2' : '#FEF3C7',
              color: a.severity === 'critical' ? '#B91C1C' : '#B45309',
            }}>
              {a.type.replace(/_/g, ' ')}
            </span>
          </div>
          {a.issues && a.issues.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 11, color: '#4B5563' }}>
              {a.issues.map((iss, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{iss.message}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
};

export default FloAlertsSection;
