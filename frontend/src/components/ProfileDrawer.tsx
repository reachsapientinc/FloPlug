/**
 * ProfileDrawer.tsx
 *
 * Curtain-style profile drawer that slides in from the top-right corner
 * when the user avatar/name is clicked.
 *
 * Shows:
 *   - User name + email + role badge
 *   - Admin Dashboard link (isHubAdmin only)
 *   - Execution Viewer link (view:logs permission)
 *   - Scheduler link (invoke:flos permission)
 *   - Preferences (placeholder)
 *   - Sign out
 *
 * Usage:
 *   <ProfileDrawer
 *     user={{ displayName, email, role }}
 *     isHubAdmin={isHubAdmin}
 *     permissions={permissions}
 *     hubName={hubName}
 *     hubLogoUrl={hubLogoUrl}
 *     onNavigate={(section) => ...}
 *     onSignOut={() => ...}
 *   />
 */

import React, { useState, useRef, useEffect } from 'react';
import { PERMISSIONS } from '@floplug/shared';

export type DashboardSection = 'admin' | 'executions' | 'scheduler' | 'preferences';

export interface ProfileDrawerUser {
  displayName?: string;
  email:        string;
  role:         string;
}

export interface ProfileDrawerProps {
  user:        ProfileDrawerUser;
  isHubAdmin:  boolean;
  permissions: string[];
  hubName?:    string;
  hubLogoUrl?: string;
  onNavigate:  (section: DashboardSection) => void;
  onSignOut:   () => void;
}

const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  user, isHubAdmin, permissions, hubName, hubLogoUrl, onNavigate, onSignOut,
}) => {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const initials = (user.displayName ?? user.email).slice(0, 2).toUpperCase();
  const canViewLogs    = isHubAdmin || permissions.includes(PERMISSIONS.VIEW_LOGS);
  const canSchedule    = isHubAdmin || permissions.includes(PERMISSIONS.INVOKE_FLOS);

  const navItem = (
    label:   string,
    icon:    string,
    section: DashboardSection,
    badge?:  string,
  ) => (
    <button
      key={section}
      onClick={() => { setOpen(false); onNavigate(section); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '9px 16px',
        border: 'none', background: 'transparent',
        color: '#111827', fontSize: 14, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        borderRadius: 0, transition: 'background 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F3F4F6'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#1a56db',
          background: '#EBF2FF', borderRadius: 20, padding: '2px 7px',
          letterSpacing: '0.3px',
        }}>
          {badge}
        </span>
      )}
      <svg width="12" height="12" fill="none" stroke="#9CA3AF" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
  );

  return (
    <div ref={drawerRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px 4px 4px', borderRadius: 24,
          border: open ? '1.5px solid #1a56db' : '1.5px solid transparent',
          background: open ? '#EBF2FF' : 'rgba(255,255,255,0.08)',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        {/* Avatar circle */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a56db 0%, #7C3AED 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
          userSelect: 'none',
        }}>
          {initials}
        </div>
        {/* Name — only on wider screens */}
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: open ? '#1a56db' : '#e0e0e8',
          maxWidth: 100, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {user.displayName ?? user.email.split('@')[0]}
        </span>
        <svg
          width="10" height="10" fill="none" stroke={open ? '#1a56db' : '#9CA3AF'}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Curtain drawer */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 280, zIndex: 9999,
          background: '#fff', borderRadius: 12,
          border: '1px solid #E5E7EB',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          animation: 'fp-drawer-in 0.15s ease-out',
        }}>
          <style>{`
            @keyframes fp-drawer-in {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* User info header */}
          <div style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid #F3F4F6',
            background: 'linear-gradient(135deg, #F8FAFF 0%, #F3F4F6 100%)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1a56db 0%, #7C3AED 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.displayName ?? user.email.split('@')[0]}
                </div>
                <div style={{ fontSize: 11, color: '#6B7280',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              </div>
            </div>

            {/* Role + admin badge */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#374151',
                background: '#F3F4F6', border: '1px solid #E5E7EB',
                borderRadius: 20, padding: '2px 8px',
              }}>
                {user.role}
              </span>
              {isHubAdmin && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#1a56db',
                  background: '#EBF2FF', border: '1px solid #BFDBFE',
                  borderRadius: 20, padding: '2px 8px',
                }}>
                  HUB ADMIN
                </span>
              )}
            </div>
          </div>

          {/* Navigation items */}
          <div style={{ padding: '6px 0' }}>
            {isHubAdmin && navItem('Admin Dashboard', '⚙️', 'admin', 'ADMIN')}
            {canViewLogs && navItem('Execution Viewer', '📊', 'executions')}
            {canSchedule  && navItem('Scheduler', '⏰', 'scheduler')}
            {navItem('Preferences', '🎨', 'preferences')}
          </div>

          {/* Sign out */}
          <div style={{ borderTop: '1px solid #F3F4F6', padding: '6px 0 4px' }}>
            <button
              onClick={() => { setOpen(false); onSignOut(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 16px',
                border: 'none', background: 'transparent',
                color: '#EF4444', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>🚪</span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileDrawer;
