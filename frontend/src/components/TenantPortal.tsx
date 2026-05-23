import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { TenantConfig } from '../types/types.ts';
import type { FloMeta } from '@floplug/shared';
import { useTenantAuth } from '../hooks/useTenantAuth';
import TenantLogin from './TenantLogin';

// Lazy-load the designer so it only runs after auth is confirmed
const Designer = lazy(() => import('./Designer.tsx'));

interface Props {
  tenant: TenantConfig | null;
}

// ─────────────────────────────────────────────────────────
// Helper — inject CSS custom property for accent color
// Call at the top of every screen that needs --accent-primary
// ─────────────────────────────────────────────────────────
function useAccentColor(color?: string) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', color ?? '#4f8ef7');
    return () => {
      root.style.setProperty('--accent-primary', '#4f8ef7');
    };
  }, [color]);
}

// ─────────────────────────────────────────────────────────
// Not-found screen
// ─────────────────────────────────────────────────────────
const NotFound: React.FC = () => {
  useAccentColor('#f87171');
  return (
    <div style={rootStyle}>
      <div style={gridStyle} />
      <div style={cardStyle}>
        <div style={{ ...iconWrap, background: 'rgba(220,38,38,0.12)' }}>
          <svg width="24" height="24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f4', marginBottom: 6 }}>Environment not found</div>
        <div style={{ fontSize: 13, color: '#6b6b80', textAlign: 'center', maxWidth: 300 }}>
          No tenant is configured for this URL. Check the slug and environment in the address bar.
        </div>
        <div style={{ marginTop: 16, fontSize: 11, color: '#3a3a50' }}>
          Expected: internal.floplug.xyz/&#123;slug&#125;/&#123;env&#125;
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Inactive environment screen
// ─────────────────────────────────────────────────────────
const InactiveScreen: React.FC<{ tenant: TenantConfig }> = ({ tenant }) => {
  const name = tenant.branding?.displayTitle || tenant.tenantName;
  return (
    <div style={rootStyle}>
      <div style={gridStyle} />
      <div style={{ ...styles.accentBar, background: 'var(--accent-primary)' }} />
      <div style={cardStyle}>
        <div style={{ ...iconWrap, background: 'rgba(245,158,11,0.1)' }}>
          <svg width="24" height="24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f0f0f4', marginBottom: 6 }}>
          {name} — {tenant.env.toUpperCase()} not active
        </div>
        <div style={{ fontSize: 13, color: '#6b6b80', textAlign: 'center', maxWidth: 300 }}>
          This environment has been provisioned but is not yet enabled. Contact your FloPlug administrator.
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Loading spinner
// ─────────────────────────────────────────────────────────
const Spinner: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div style={{ ...rootStyle, gap: 12 }}>
    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--accent-primary)', animation: 'fp-spin 0.7s linear infinite' }} />
    <style>{`@keyframes fp-spin{to{transform:rotate(360deg)}}`}</style>
    <span style={{ fontSize: 12, color: '#3a3a50' }}>{label}</span>
  </div>
);

const PortalDropdown: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}> = ({ open, onClose, children, width = 280 }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, width,
      background: '#181b24', border: '0.5px solid rgba(255,255,255,0.12)',
      borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', zIndex: 9999, padding: '8px 0',
    }}>
      {children}
    </div>
  );
};

const menuInputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 8px', borderRadius: 6,
  border: '0.5px solid rgba(255,255,255,0.15)', background: '#0f1117',
  color: '#fff', fontSize: 11, fontFamily: 'inherit', outline: 'none',
};

const menuBtnSm: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: 'none',
  background: '#4f8ef7', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
};

const menuItemBtn: React.CSSProperties = {
  flex: 1, textAlign: 'left', padding: '6px 8px', border: 'none',
  background: 'transparent', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
};

const menuIconBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#6b6b80', cursor: 'pointer', fontSize: 12, padding: '2px 4px',
};

// ─────────────────────────────────────────────────────────
// Authenticated portal shell
// ─────────────────────────────────────────────────────────
const AuthenticatedShell: React.FC<{
  tenant:      TenantConfig;
  user:        import('../types/types.ts').TenantUser;
  permissions: string[];
  isHubAdmin:  boolean;
  logout:      () => void;
}> = ({ tenant, user, permissions, isHubAdmin, logout }) => {
  const displayName = tenant.branding?.displayTitle || tenant.tenantName;
  const envLabel    = tenant.env.toUpperCase();

  const [activeFlo, setActiveFlo]       = useState<FloMeta | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const slugRef = useRef(tenant.slug);
  const envRef  = useRef(tenant.env);

  useEffect(() => {
    const handlePop = () => {
      const parts = window.location.pathname.replace(/^\//, '').split('/');
      const newSlug = parts[0] ?? '';
      const newEnv  = parts[1] ?? '';
      if (newSlug !== slugRef.current || newEnv !== envRef.current) {
        logout();
        // Reload so tenantResolver re-runs with the new path
        window.location.reload();
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [logout]);

  return (
    <div style={styles.shell}>
      {/* Brand accent stripe */}
      <div style={{ ...styles.accentBar, background: 'var(--accent-primary)' }} />

      {/* Top bar */}
      <div style={styles.topbar}>
        {/* Logo */}
        {tenant.branding?.logoBase64 ? (
          <img src={tenant.branding.logoBase64} alt={displayName} style={styles.logoImg} />
        ) : (
          <div style={{ ...styles.logoSquare, background: 'var(--accent-primary)' }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <span style={styles.brandName}>{displayName}</span>
        <span style={styles.envChip}>{envLabel}</span>

        <div style={styles.divbar} />

        <nav style={{ display: 'flex', gap: 2 }}>
          <div style={{ position: 'relative' }}>
            <button type="button" style={{ ...styles.navBtn, ...(settingsOpen ? styles.navBtnActive : {}) }}
              onClick={() => setSettingsOpen(o => !o)}>
              Settings
            </button>
            <PortalDropdown open={settingsOpen} onClose={() => setSettingsOpen(false)}>
              <div style={{ padding: '10px 14px', fontSize: 12, color: '#9090a0', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600, color: '#e0e0e8', marginBottom: 6 }}>Workspace & flo settings</div>
                <p style={{ margin: '0 0 8px' }}>Use the designer toolbar to manage workspaces and flos. Sharing controls will appear here.</p>
                <p style={{ margin: '10px 0 0', fontSize: 10, color: '#6b6b80' }}>Coming soon</p>
              </div>
            </PortalDropdown>
          </div>
        </nav>
      </div>

      {/* Main area — lazy-loaded Designer, scoped to this user's hub+tenant */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Suspense fallback={<Spinner label="Loading designer…" />}>
          <Designer
            hubId={tenant.hubId}
            tenantId={tenant.tenantId}
            tenantType={tenant.tenantType}
            userId={user.uid}
            userRole={user.role}
            workspaceIds={user.workspaceIds}
            isAdmin={isHubAdmin}
            permissions={permissions}
            onSignOut={logout}
onActiveFloChange={setActiveFlo}
          />
        </Suspense>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>{window.location.hostname}/{tenant.slug}</span>
        <span style={{ fontFamily: 'monospace', color: activeFlo?.shortCode ? '#9090a0' : '#3a3a50' }}>
          {activeFlo?.shortCode ? `Flo: ${activeFlo.shortCode}` : 'No flo selected'}
          {activeFlo?.name ? ` · ${activeFlo.name}` : ''}
        </span>
        <span>Powered by FloPlug</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────
// Main TenantPortal
// ─────────────────────────────────────────────────────────
const TenantPortal: React.FC<Props> = ({ tenant }) => {
  const { user, loading, error, login, logout, permissions, isHubAdmin } = useTenantAuth(tenant);

  if (!tenant) return <NotFound />;

  if (loading) return <Spinner label="Resolving environment…" />;

  if (!tenant.isActive) return <InactiveScreen tenant={tenant} />;

  if (!user) {
    return (
      <TenantLogin
        tenant={tenant}
        onLogin={login}
        error={error}
        loading={loading}
      />
    );
  }

  return <AuthenticatedShell tenant={tenant} user={user} permissions={permissions} isHubAdmin={isHubAdmin} logout={logout} />;
};

export default TenantPortal;

// ─────────────────────────────────────────────────────────
// Shared style objects
// ─────────────────────────────────────────────────────────
const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0f1117',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  position: 'relative',
  overflow: 'hidden',
};

const gridStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),' +
    'linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',
  backgroundSize: '40px 40px',
  pointerEvents: 'none',
};

const cardStyle: React.CSSProperties = {
  background: '#181b24',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  padding: '36px 32px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  position: 'relative',
  zIndex: 1,
  maxWidth: 400,
  width: '100%',
};

const iconWrap: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 8,
};

const styles: Record<string, React.CSSProperties> = {
  accentBar: {
    height: 3,
    width: '100%',
    flexShrink: 0,
  },
  shell: {
    height: '100vh',
    background: '#0f1117',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    color: '#f0f0f4',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  topbar: {
    height: 50,
    background: '#181b24',
    borderBottom: '0.5px solid rgba(255,255,255,0.07)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 18px',
    gap: 11,
    flexShrink: 0,
  },
  logoImg: {
    height: 28,
    width: 'auto',
    maxWidth: 110,
    objectFit: 'contain',
    borderRadius: 5,
  },
  logoSquare: {
    width: 28,
    height: 28,
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  brandName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#f0f0f4',
  },
  envChip: {
    fontSize: 9,
    padding: '2px 8px',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.06)',
    color: '#9090a0',
    border: '0.5px solid rgba(255,255,255,0.1)',
    fontWeight: 600,
    letterSpacing: '0.4px',
  },
  divbar: {
    width: 0.5,
    height: 16,
    background: 'rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  navBtn: {
    padding: '4px 10px',
    borderRadius: 5,
    border: 'none',
    background: 'transparent',
    fontSize: 12,
    color: '#6b6b80',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.12s, background 0.12s',
  },
  userPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '4px 10px',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.08)',
  },
  userAvatar: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  userName: {
    fontSize: 11,
    color: '#9090a0',
    maxWidth: 180,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    background: 'none',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: 6,
    cursor: 'pointer',
    color: '#6b6b80',
    padding: '5px 8px',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.12s, border-color 0.12s',
  },
  navBtnActive: {
    color: '#e0e0e8',
    background: 'rgba(255,255,255,0.06)',
  },
  footer: {
    height: 34,
    background: '#141720',
    borderTop: '0.5px solid rgba(255,255,255,0.05)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 20px',
    fontSize: 11,
    color: '#3a3a50',
    flexShrink: 0,
  },
};
