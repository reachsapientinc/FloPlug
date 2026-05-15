/**
 * frontend/src/App.tsx
 *
 * Top-level router. Uses detectPortalMode() (sync, no network) to
 * decide what to mount before any Firestore calls happen.
 *
 * CHANGE: MarketingSite is now a proper imported component instead of
 * an inline `<div>`. Import it from ./components/MarketingSite.
 */

import React, { useEffect, useState }    from 'react';
import { detectPortalMode, resolveTenant } from './utils/tenantResolver';
import type {TenantConfig, FloPlugEnv} from './types/types.ts';
import AdminDashboard  from './components/AdminDashboard';
import TenantPortal    from './components/TenantPortal';
import MarketingSite   from './components/MarketingSite';

type AppState =
  | { status: 'loading' }
  | { status: 'admin';     env?: FloPlugEnv }
  | { status: 'tenant';    env: FloPlugEnv; config: TenantConfig | undefined }
  | { status: 'marketing' };

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    const init = async () => {
      const detected = detectPortalMode();

      if (detected.mode === 'marketing') {
        setState({ status: 'marketing' });
        return;
      }

      if (detected.mode === 'admin') {
        setState({ status: 'admin', env: detected.env });
        return;
      }

      // Tenant mode — async Firestore lookup
      setState({ status: 'loading' });
      const result = await resolveTenant(detected.slug!, detected.env!);
      setState({ status: 'tenant', env: detected.env!, config: result.config });
    };

    init();
  }, []);

  if (state.status === 'loading')    return <Spinner />;
  if (state.status === 'marketing')  return <MarketingSite />;
  if (state.status === 'admin')      return <AdminDashboard env={state.env} />;

  return <TenantPortal tenant={state.config ?? null} />;
};

// ── Spinner ───────────────────────────────────────────────────────────────────
const Spinner: React.FC = () => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100vh', background: '#0a0c12', gap: 12,
  }}>
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.08)',
      borderTopColor: 'var(--accent-primary, #4f8ef7)',
      animation: 'fp-spin 0.7s linear infinite',
    }} />
    <style>{`@keyframes fp-spin { to { transform: rotate(360deg); } }`}</style>
    <span style={{ fontSize: 12, color: '#3a3a50' }}>Resolving environment…</span>
  </div>
);

export default App;
export type { FloPlugEnv };
