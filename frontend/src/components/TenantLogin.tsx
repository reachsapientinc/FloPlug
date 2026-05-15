import React, { useState } from 'react';
import type { TenantConfig } from '../types/types.ts';


interface Props {
  tenant: TenantConfig;
  onLogin: (email: string, password: string) => Promise<boolean>;
  error: string;
  loading: boolean;
}

const TenantLogin: React.FC<Props> = ({ tenant, onLogin, error, loading }) => {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const displayName = tenant.branding?.displayTitle || tenant.tenantName;
  const initial     = displayName.charAt(0).toUpperCase();
  const envLabel    = tenant.env.toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email.trim(), password);
  };

  return (
    <div style={styles.root}>
      {/* Subtle dot-grid overlay */}
      <div style={styles.grid} />

      {/* Accent top stripe (brand color) */}
      <div style={{ ...styles.accentBar, background: 'var(--accent-primary)' }} />

      <div style={styles.card}>
        {/* Logo + brand name */}
        <div style={styles.logoRow}>
          {tenant.branding?.logoBase64 ? (
            <img
              src={tenant.branding.logoBase64}
              alt={`${displayName} logo`}
              style={styles.logoImg}
            />
          ) : (
            <div style={{ ...styles.logoSquare, background: 'var(--accent-primary)' }}>
              {initial}
            </div>
          )}
          <div>
            <div style={styles.brandName}>{displayName}</div>
          </div>
          <span style={styles.envChip}>{envLabel}</span>
        </div>

        <div style={styles.loginTitle}>Welcome back</div>
        <div style={styles.loginSub}>
          Sign in to access your integration workspace
        </div>

        {/* URL context pill */}
        <div style={styles.urlPill}>
          <span style={styles.urlDot} />
          <span style={styles.urlText}>
            {window.location.hostname}/{tenant.slug}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>

          {/* Password */}
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ ...styles.input, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={styles.eyeBtn}
                tabIndex={-1}
              >
                {showPass ? (
                  <svg width="14" height="14" fill="none" stroke="#6b6b80" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" fill="none" stroke="#6b6b80" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              background: 'var(--accent-primary)',
              opacity: loading ? 0.65 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={styles.footerNote}>
          Access is restricted to users provisioned in this tenant
        </div>
      </div>

      {/* FloPlug watermark */}
      <div style={styles.watermark}>Powered by FloPlug</div>
    </div>
  );
};

/* ── Styles ── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0f1117',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),' +
      'linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  card: {
    background: '#181b24',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 380,
    position: 'relative',
    zIndex: 1,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  logoImg: {
    height: 32,
    width: 'auto',
    maxWidth: 100,
    objectFit: 'contain',
    borderRadius: 6,
  },
  logoSquare: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  brandName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#f0f0f4',
    lineHeight: 1,
  },
  envChip: {
    marginLeft: 'auto',
    fontSize: 9,
    padding: '2px 8px',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.06)',
    color: '#9090a0',
    border: '0.5px solid rgba(255,255,255,0.1)',
    fontWeight: 600,
    letterSpacing: '0.4px',
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#f0f0f4',
    marginBottom: 4,
  },
  loginSub: {
    fontSize: 12,
    color: '#6b6b80',
    marginBottom: 18,
  },
  urlPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 11px',
    borderRadius: 7,
    background: 'rgba(255,255,255,0.03)',
    border: '0.5px solid rgba(255,255,255,0.06)',
    marginBottom: 18,
  },
  urlDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    flexShrink: 0,
    display: 'inline-block',
  },
  urlText: {
    fontSize: 11,
    color: '#6b6b80',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '9px 12px',
    borderRadius: 7,
    background: 'rgba(220,38,38,0.1)',
    border: '0.5px solid rgba(220,38,38,0.2)',
    color: '#f87171',
    fontSize: 12,
    marginBottom: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    color: '#9090a0',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 7,
    border: '0.5px solid rgba(255,255,255,0.1)',
    background: '#0f1117',
    color: '#f0f0f4',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  },
  submitBtn: {
    width: '100%',
    padding: '10px',
    borderRadius: 8,
    border: 'none',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    marginTop: 4,
    transition: 'opacity 0.15s',
  },
  footerNote: {
    fontSize: 11,
    color: '#3a3a50',
    textAlign: 'center',
    marginTop: 16,
  },
  watermark: {
    position: 'absolute',
    bottom: 20,
    fontSize: 11,
    color: '#2a2a38',
    zIndex: 1,
  },
};

export default TenantLogin;
