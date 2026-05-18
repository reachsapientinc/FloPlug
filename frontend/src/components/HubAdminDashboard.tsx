/**
 * HubAdminDashboard.tsx
 *
 * Full-page hub admin dashboard. Renders in place of the Designer when
 * the user navigates to it via the Profile drawer.
 *
 * Sections (all placeholder until built out):
 *   Plugs        — create, edit, deactivate plug configs
 *   Users        — invite, edit roles, deactivate hub users
 *   Scheduler    — create/edit flo schedules (cron / interval)
 *   Key Vault    — SSH, PGP, API key management
 *   Executions   — execution log viewer with flo diagram replay
 *
 * Color: FloPlug branded — white base, #1a56db blue accent,
 *        high-contrast dark text. No light-grey-on-blue.
 *
 * Props:
 *   hubId / tenantId   — scoping
 *   userId             — current user
 *   permissions        — from token claims, drives which tabs are visible
 *   isHubAdmin         — whether full admin tabs are shown
 *   onBack             — called when user clicks "← Designer"
 */

import React, { useState } from 'react';
import { PERMISSIONS } from '@floplug/shared';
import FloConnectionsSection from './FloConnectionManager.tsx';
import PlugManager     from './PlugManager';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface HubAdminDashboardProps {
  hubId:       string;
  tenantId:    string;
  userId:      string;
  permissions: string[];
  isHubAdmin:  boolean;
  hubName?:    string;
  hubLogoUrl?: string;
  onBack:      () => void;
}

type TabId = 'plugs' | 'users' | 'scheduler' | 'keys' | 'executions' | 'connections';

interface Tab {
  id:         TabId;
  label:      string;
  icon:       string;
  adminOnly:  boolean;
  permission: string | null;   // null = always visible to anyone who can see the dashboard
}

const TABS: Tab[] = [
  { id: 'plugs',      label: 'Plugs',           icon: '🔌', adminOnly: true,  permission: PERMISSIONS.MANAGE_PLUGS  },
  { id: 'users',      label: 'Users',            icon: '👥', adminOnly: true,  permission: PERMISSIONS.MANAGE_USERS  },
  { id: 'scheduler',  label: 'Scheduler',        icon: '⏰', adminOnly: false, permission: PERMISSIONS.INVOKE_FLOS   },
  { id: 'keys',       label: 'Key Vault',        icon: '🔑', adminOnly: true,  permission: PERMISSIONS.MANAGE_SETTINGS },
  { id: 'executions', label: 'Execution Viewer', icon: '📊', adminOnly: false, permission: PERMISSIONS.VIEW_LOGS     },
  { id: 'connections', label: 'Connections',     icon: '🔗', adminOnly: true, permission: PERMISSIONS.MANAGE_PLUGS }
];

// ── Placeholder section ───────────────────────────────────────────────────────
const PlaceholderSection: React.FC<{
  icon:        string;
  title:       string;
  description: string;
  bullets:     string[];
  badge?:      string;
}> = ({ icon, title, description, bullets, badge }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '80px 40px', textAlign: 'center',
    maxWidth: 520, margin: '0 auto',
  }}>
    <div style={{
      width: 72, height: 72, borderRadius: 20,
      background: 'linear-gradient(135deg, #EBF2FF 0%, #DBEAFE 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 32, marginBottom: 24, flexShrink: 0,
      boxShadow: '0 4px 16px rgba(26,86,219,0.12)',
    }}>
      {icon}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>{title}</h2>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#1a56db',
          background: '#EBF2FF', border: '1px solid #BFDBFE',
          borderRadius: 20, padding: '2px 10px', letterSpacing: '0.4px',
        }}>
          {badge}
        </span>
      )}
    </div>
    <p style={{ margin: '0 0 28px', fontSize: 15, color: '#4B5563', lineHeight: 1.7 }}>
      {description}
    </p>
    <div style={{
      width: '100%', background: '#F9FAFB',
      border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px',
      textAlign: 'left',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        Planned features
      </div>
      {bullets.map((b, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <span style={{ color: '#1a56db', fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>→</span>
          <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{b}</span>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 24, fontSize: 13, color: '#9CA3AF' }}>
      This module is coming soon. Architecture is being designed.
    </div>
  </div>
);

// ── Plugs section — uses existing PlugManager component ──────────────────────
const PlugsSection: React.FC<{ hubId: string; tenantId: string; userId: string }> = ({ hubId, tenantId, userId }) => (
  <div style={{
    background: '#fff', border: '1px solid #E5E7EB',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    minHeight: 500,
  }}>
    <PlugManager
      hubId={hubId}
      tenantId={tenantId}
      userId={userId}
      isAdmin={true}
      section="plugs"
      lightTheme={true}
    />
  </div>
);

const UsersManagementSection: React.FC<{ hubId: string; tenantId: string; userId: string }> = ({ hubId, tenantId, userId }) => (
  <div style={{
    background: '#fff', border: '1px solid #E5E7EB',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    minHeight: 500,
  }}>
    <PlugManager
      hubId={hubId}
      tenantId={tenantId}
      userId={userId}
      isAdmin={true}
      section="users"
      lightTheme={true}
    />
  </div>
);

// UsersSection replaced by UsersManagementSection using PlugManager with section='users'

// ── Scheduler placeholder ─────────────────────────────────────────────────────
const SchedulerSection: React.FC = () => (
  <PlaceholderSection
    icon="⏰"
    title="Flo Scheduler"
    description="Schedule flos to run automatically on a cron expression or fixed interval. Monitor upcoming and past scheduled runs."
    badge="COMING SOON"
    bullets={[
      'Create schedules with cron expressions or human-readable intervals (every 5 min, daily at 9am)',
      'Enable / disable schedules without deleting them',
      'Pass a static input JSON payload to each scheduled run',
      'View upcoming scheduled runs and last run status',
      'Retry on failure — configurable retry count and backoff',
      'Email or webhook notification on schedule failure',
    ]}
  />
);

// ── Key Vault placeholder ─────────────────────────────────────────────────────
const KeysSection: React.FC = () => (
  <PlaceholderSection
    icon="🔑"
    title="Key Vault"
    description="Centrally manage SSH keys, PGP keys, and API credentials used by plugs and storage connectors. Keys are stored encrypted and never exposed in logs."
    badge="COMING SOON"
    bullets={[
      'Add SSH key pairs for SFTP plug authentication',
      'Upload PGP public/private keys for file encryption/decryption',
      'Store named API credentials referenced by URL patterns in plugs',
      'Key rotation — replace a key and all plugs using it update automatically',
      'Key expiry alerts — get notified before a key expires',
      'Audit log — who accessed or rotated each key and when',
    ]}
  />
);

// ── Executions placeholder ────────────────────────────────────────────────────
const ExecutionsSection: React.FC = () => (
  <PlaceholderSection
    icon="📊"
    title="Execution Viewer"
    description="Browse all flo executions. Click any execution to open a replay view showing the exact state at each node — inputs, outputs, errors, and timing."
    badge="COMING SOON"
    bullets={[
      'List all executions with status (success, error, running), flo name, trigger, and duration',
      'Filter by flo, date range, status, and triggered-by user',
      'Click an execution → open the flo diagram with per-node result overlays',
      'Each node shows: input received, output produced, time taken, error if any',
      'Download execution payload as JSON or XML',
      'Execution data stored as files in cloud storage — not in Firestore — for cost efficiency',
      'Store Node: explicitly save cStream/local/global values to a file during execution',
    ]}
  />
);



// ── Main dashboard ────────────────────────────────────────────────────────────
const HubAdminDashboard: React.FC<HubAdminDashboardProps> = ({
  hubId, tenantId, userId, permissions, isHubAdmin,
  hubName = 'FloPlug', hubLogoUrl, onBack,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('plugs');

  // Filter tabs by permission
  const visibleTabs = TABS.filter(t => {
    if (t.adminOnly && !isHubAdmin) return false;
    if (t.permission && !isHubAdmin && !permissions.includes(t.permission)) return false;
    return true;
  });

  // Ensure activeTab is always visible
  const effectiveTab = visibleTabs.find(t => t.id === activeTab)?.id ?? visibleTabs[0]?.id ?? 'executions';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#F3F4F6',
      fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      color: '#111827',
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: 56, background: '#fff',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 16, flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            border: '1px solid #E5E7EB', background: '#F9FAFB',
            color: '#374151', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F3F4F6'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F9FAFB'; }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Designer
        </button>

        <div style={{ width: 1, height: 20, background: '#E5E7EB' }} />

        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hubLogoUrl ? (
            <img src={hubLogoUrl} alt={hubName}
              style={{ height: 28, width: 'auto', objectFit: 'contain', borderRadius: 6 }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #1a56db 0%, #7C3AED 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{hubName}</div>
            <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1 }}>Admin Dashboard</div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {isHubAdmin && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#1a56db',
              background: '#EBF2FF', border: '1px solid #BFDBFE',
              borderRadius: 20, padding: '3px 10px', letterSpacing: '0.4px',
            }}>
              HUB ADMIN
            </span>
          )}
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a56db, #7C3AED)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {userId.slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar nav ──────────────────────────────────────────────────── */}
        <div style={{
          width: 220, background: '#fff',
          borderRight: '1px solid #E5E7EB',
          display: 'flex', flexDirection: 'column',
          padding: '20px 12px', gap: 4, flexShrink: 0,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.6px',
            padding: '0 8px', marginBottom: 8,
          }}>
            Management
          </div>

          {visibleTabs.map(tab => {
            const isActive = tab.id === effectiveTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: isActive ? 600 : 400,
                  background: isActive ? '#EBF2FF' : 'transparent',
                  color: isActive ? '#1a56db' : '#374151',
                  textAlign: 'left', width: '100%',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = '#F9FAFB';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>
                  {tab.icon}
                </span>
                <span style={{ flex: 1 }}>{tab.label}</span>
                {isActive && (
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#1a56db', flexShrink: 0,
                  }} />
                )}
              </button>
            );
          })}

          {/* Divider + info */}
          <div style={{ marginTop: 'auto', padding: '16px 8px 0', borderTop: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Hub</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#9CA3AF', wordBreak: 'break-all' }}>
                {hubId} / {tenantId}
              </div>
            </div>
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>

          {/* Page header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#111827' }}>
              {TABS.find(t => t.id === effectiveTab)?.icon}{' '}
              {TABS.find(t => t.id === effectiveTab)?.label}
            </h1>
            <div style={{ fontSize: 14, color: '#6B7280' }}>
              {effectiveTab === 'plugs'      && 'Manage plug configurations and credentials for your hub.'}
              {effectiveTab === 'users'      && 'Manage hub users, roles, and workspace access.'}
              {effectiveTab === 'scheduler'  && 'Schedule flos to run automatically on a timer or cron expression.'}
              {effectiveTab === 'keys'       && 'Manage SSH keys, PGP keys, and named credentials used by plugs.'}
              {effectiveTab === 'executions' && 'Browse flo execution history and replay individual runs with node-level details.'}
            </div>
          </div>

          {/* Stats bars removed — each section manages its own list and counts */}

          {/* Section content */}
          {effectiveTab === 'plugs'      && <PlugsSection hubId={hubId} tenantId={tenantId} userId={userId} />}
          {effectiveTab === 'users'      && <UsersManagementSection hubId={hubId} tenantId={tenantId} userId={userId} />}
          {effectiveTab === 'scheduler'  && <SchedulerSection />}
          {effectiveTab === 'keys'       && <KeysSection />}
          {effectiveTab === 'executions' && <ExecutionsSection />}
          {/* {effectiveTab === 'connections' && <FloConnectionsSection hubId={hubId} tenantId={tenantId} userId={userId} />} */}
        </div>
      </div>
    </div>
  );
};

export default HubAdminDashboard;
