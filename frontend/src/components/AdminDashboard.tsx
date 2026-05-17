/**
 * AdminDashboard.tsx
 *
 * FIX: Removed `.ts` extension from the useTenantAuth import.
 * TypeScript/Vite module resolution rejects literal `.ts` in import paths —
 * it causes the module to fail to load, which is why `useAdminAuth` appeared
 * to not be exported (the file never loaded at all).
 *
 * Correct:  import { useAdminAuth } from '../hooks/useTenantAuth'
 * Wrong:    import { useAdminAuth } from '../hooks/useTenantAuth.ts'
 */

import React, { useState } from 'react';
import { useAdminAuth }   from '../hooks/useTenantAuth';
import type { FloPlugEnv } from '../types/types';
import HubProvisioner    from '../modules/HubManagement';
import TierManager       from '../modules/TierManagement';
import AuthManager       from '../modules/AuthManagement';
import ConnectorManager  from '../modules/ConnectorManagement';
import ActionManager     from '../modules/ActionManagement';
import UserManagement    from '../modules/UserManagement';
import FloKitManager from '../modules/FloKitManagement';
import '../App.css';

// ── Environment metadata ──────────────────────────────────────────────────────

const ENV_META: Record<FloPlugEnv, { label: string; color: string; bg: string; description: string }> = {
  dev:   { label: 'DEV',   color: '#185FA5', bg: 'rgba(24,95,165,0.1)',  description: 'Developer environment — internal use only' },
  stage: { label: 'STAGE', color: '#0F6E56', bg: 'rgba(15,110,86,0.1)',  description: 'Pre-release testing environment' },
  sb:    { label: 'SB',    color: '#854F0B', bg: 'rgba(133,79,11,0.1)',  description: 'Sandbox — prod copy for customer debugging' },
  prod:  { label: 'PROD',  color: '#A32D2D', bg: 'rgba(163,45,45,0.1)', description: 'Live production environment' },
};

type Module = 'hub' | 'tiers' | 'auth' | 'connectors' | 'actions' |  'floKits' |'users';

const MODULES: { id: Module; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'hub', label: 'Hub provisioning', description: 'Hub management',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
  {
    id: 'tiers', label: 'Tier strategy', description: 'Subscription tiers',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  },
  {
    id: 'auth', label: 'Security protocols', description: 'Auth management',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  },
  {
    id: 'connectors', label: 'Connector registry', description: 'Connector registry',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  },
  {
    id: 'actions', label: 'Schema management', description: 'Schema & action registry',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  },
  {
  id: 'floKits', label: 'FloKit management', description: 'FloKit management',
  icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
},
  {
    id: 'users', label: 'User management', description: 'User management',
    icon: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  },
];

// ── Admin login screen ────────────────────────────────────────────────────────

const AdminLogin: React.FC<{
  env?:     FloPlugEnv;
  onLogin:  (email: string, password: string) => Promise<boolean>;
  error:    string;
  loading:  boolean;
}> = ({ env, onLogin, error, loading }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const meta = env ? ENV_META[env] : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email.trim(), password);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
      {/* Dot grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      {/* Env accent stripe */}
      {meta && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: meta.color }} />}

      <div style={{ background: '#181b24', border: '0.5px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '36px 32px', width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>
        {/* Brand + env badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#4f8ef7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>F</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f4' }}>FloPlug Admin</div>
          {meta && (
            <span style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, letterSpacing: '0.4px', background: meta.bg, color: meta.color, border: `0.5px solid ${meta.color}44` }}>
              {meta.label}
            </span>
          )}
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f0f4', marginBottom: 4 }}>Product admin</div>
        <div style={{ fontSize: 12, color: '#6b6b80', marginBottom: 20 }}>
          {meta?.description ?? 'Sign in to manage FloPlug'}
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 7, background: 'rgba(220,38,38,.1)', border: '0.5px solid rgba(220,38,38,.2)', color: '#f87171', fontSize: 12, marginBottom: 14 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#9090a0', marginBottom: 5 }}>Email</div>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@floplug.xyz"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#9090a0', marginBottom: 5 }}>Password</div>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.65 : 1 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ fontSize: 11, color: '#3a3a50', textAlign: 'center', marginTop: 16 }}>
          Access restricted to FloPlug product administrators
        </div>
      </div>
    </div>
  );
};

// ── Authenticated admin dashboard ─────────────────────────────────────────────

const AdminDashboard: React.FC<{ env?: FloPlugEnv }> = ({ env }) => {
  const { user, loading, error, login, logout } = useAdminAuth(env);
  const [activeModule, setActiveModule] = useState<Module>('hub');

  const meta    = env ? ENV_META[env] : null;
  const current = MODULES.find(m => m.id === activeModule)!;

  // Show login screen until authenticated
  if (!user) {
    return <AdminLogin env={env} onLogin={login} error={error} loading={loading} />;
  }

  return (
    <div className="portal-shell">
      {/* Env accent stripe at the very top */}
      {meta && <div style={{ height: 3, background: meta.color, flexShrink: 0 }} />}

      {/* Top bar */}
      <nav className="top-bar">
        <div className="brand-section">
          <div className="logo">
            <span className="logo-dot" />
            FloPlug<span className="logo-ext">.xyz</span>
          </div>
          {/* Env badge — always visible so admins know which env they're in */}
          {meta && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, letterSpacing: '0.4px', background: meta.bg, color: meta.color, border: `0.5px solid ${meta.color}44` }}>
              {meta.label}
            </span>
          )}
          <span className="page-title">{current.description}</span>
        </div>

        <div className="top-bar-right">
          <div className="app-drawer-container">
            <button className="drawer-trigger">Manage FloPlug ▾</button>
            <div className="app-drawer-menu">
              {MODULES.map(m => (
                <a key={m.id} onClick={() => setActiveModule(m.id)}>
                  <span className="drawer-icon">{m.icon}</span>
                  {m.label}
                </a>
              ))}
            </div>
          </div>

          {/* User pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 20, background: 'var(--bg-raised)', border: '0.5px solid var(--border-default)', fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#4f8ef7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
              {user.email.slice(0, 2).toUpperCase()}
            </div>
            {user.email}
          </div>

          <button onClick={logout} style={{ padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Platform</div>
            {MODULES.slice(0, 2).map(m => (
              <div key={m.id} className={`nav-item ${activeModule === m.id ? 'active' : ''}`} onClick={() => setActiveModule(m.id)}>
                {m.icon}<span>{m.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Integrations</div>
            {MODULES.slice(2, 6).map(m => (
              <div key={m.id} className={`nav-item ${activeModule === m.id ? 'active' : ''}`} onClick={() => setActiveModule(m.id)}>
                {m.icon}<span>{m.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Users</div>
            {MODULES.slice(5).map(m => (
              <div key={m.id} className={`nav-item ${activeModule === m.id ? 'active' : ''}`} onClick={() => setActiveModule(m.id)}>
                {m.icon}<span>{m.label}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', padding: 12, borderTop: '0.5px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 6, background: 'var(--green-bg)', fontSize: 11, color: 'var(--green)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              Online · {meta?.label ?? 'LOCAL'}
            </div>
          </div>
        </div>

        <main className="main-content">
          <div className={`content-viewport${activeModule === 'floKits' ? ' content-viewport-wide' : ''}`}>
            <div className="page-header">
              <h2>{current.description}</h2>
              <p>
                {activeModule === 'hub'        && 'Provision subscriber hubs with tenant environments and branding'}
                {activeModule === 'tiers'      && 'Define subscription tiers, included quotas, and overage pricing'}
                {activeModule === 'auth'       && 'Manage authentication strategies available to hub administrators'}
                {activeModule === 'connectors' && 'Register pre-built integrations available across all tenant environments'}
                {activeModule === 'actions'    && 'Upload schemas (WSDL / XSD / OpenAPI) and register connector actions'}
                {activeModule === 'floKits'    && 'Define FloKits — schema version + action set per connector, synced to Action Node templates'}
                {activeModule === 'users'      && 'Invite and manage product admins, developers, and hub-scoped users'}
              </p>
            </div>
            {activeModule === 'hub'        && <HubProvisioner />}
            {activeModule === 'tiers'      && <TierManager />}
            {activeModule === 'auth'       && <AuthManager />}
            {activeModule === 'connectors' && <ConnectorManager />}
            {activeModule === 'actions'    && <ActionManager />}
            {activeModule === 'floKits'    && <FloKitManager />}
            {activeModule === 'users'      && <UserManagement />}
          </div>
        </main>
      </div>

      <footer className="bottom-bar">
        <div><span className="status-dot" />System core: online</div>
        <div>© 2026 FloPlug.xyz · {meta?.label ?? 'LOCAL'}</div>
      </footer>
    </div>
  );
};

export default AdminDashboard;
