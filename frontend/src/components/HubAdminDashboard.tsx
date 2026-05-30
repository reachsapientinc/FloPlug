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

import React, { useState, useEffect, useMemo } from 'react';
import { PERMISSIONS } from '@floplug/shared';
import type { FloConnectionSafe, AuthProtocol, ConnectorDoc, PlugSummary, TenantUser, HubActionNodeDoc } from '@floplug/shared';
import type { ExistingActionNodeRef } from './FloActionManager';
import type { FloMeta } from './../handlers/hubActionHandler';
import {
  usePlugManagerActions,
}                                                 from './../handlers/hubActionHandler';
import PlugManager from './PlugManager';
import { FloConnectionManager } from './FloConnectionManager';
import { FloActionManager } from './FloActionManager';
import { FloAlertsSection } from './FloAlertsSection';
import { useHubEntitledCatalog } from './../hooks/useHubEntitledCatalog';
import { enterProductDocs, enterHubConfigDocs } from '../docs';

// ── Types ─────────────────────────────────────────────────────────────────────
type TabId = 'plugs' | 'users' | 'scheduler' | 'keys' | 'alerts' | 'connections' | 'actions';

export interface HubAdminDashboardProps {
  hubId:       string;
  tenantId:    string;
  userId:      string;
  permissions: string[];
  isHubAdmin:  boolean;
  hubName?:    string;
  hubLogoUrl?: string;
  initialTab?: TabId;
  onTabChange?: (tab: TabId) => void;
  onBack:      () => void;
}

interface Tab {
  id:         TabId;
  label:      string;
  icon:       string;
  adminOnly:  boolean;
  permission: string | null;   // null = always visible to anyone who can see the dashboard
}

const TABS: Tab[] = [
  { id: 'plugs',       label: 'Plugs',           icon: '🔌', adminOnly: true,  permission: PERMISSIONS.MANAGE_PLUGS  },
  { id: 'users',       label: 'Users',            icon: '👥', adminOnly: true,  permission: PERMISSIONS.MANAGE_USERS  },
  { id: 'connections', label: 'Connections',     icon: '🔗', adminOnly: true,  permission: PERMISSIONS.MANAGE_PLUGS  },
  { id: 'actions',     label: 'Actions',          icon: '⚡', adminOnly: true,  permission: PERMISSIONS.MANAGE_PLUGS  },
  { id: 'scheduler',   label: 'Scheduler',        icon: '⏰', adminOnly: false, permission: PERMISSIONS.INVOKE_FLOS   },
  { id: 'keys',        label: 'Key Vault',        icon: '🔑', adminOnly: true,  permission: PERMISSIONS.MANAGE_SETTINGS },
  { id: 'alerts',      label: 'Alerts',           icon: '🔔', adminOnly: false, permission: null },
];

const sectionCard: React.CSSProperties = {
  background: '#fff', border: '1px solid #E5E7EB',
  borderRadius: 12, overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  minHeight: 500,
  padding: '16px 20px',
};

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

// ── Executions moved to standalone FloExecutionHubApp ─────────────────────────

// ── Main dashboard ────────────────────────────────────────────────────────────
const HubAdminDashboard: React.FC<HubAdminDashboardProps> = ({
  hubId, tenantId, userId, permissions, isHubAdmin,
  hubName = 'FloPlug', hubLogoUrl, initialTab, onTabChange, onBack,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'plugs');

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };
  const [_plugs, setPlugs] = useState<PlugSummary[]>([]);
  const [_users, setUsers] = useState<TenantUser[]>([]);
  const [_flos, setFlos] = useState<FloMeta[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDoc[]>([]);
  const [protocols, setProtocols] = useState<AuthProtocol[]>([]);
  const [floConnections, setFloConnections] = useState<FloConnectionSafe[]>([]);
  const [actionNodes, setActionNodes] = useState<HubActionNodeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionSavedMsg, setActionSavedMsg] = useState('');

  const {
    fetchAll,
    handleSaveFloConnection,
    handleDeactivateFloConnection,
    handleSaveActionNode,
  } = usePlugManagerActions({
    hubId, tenantId, isAdmin: isHubAdmin, userId,
    setPlugs, setUsers, setFlos, setConnectors, setProtocols,
    setFloConnections, setActionNodes, setLoading, setLoadError,
  });

  const {
    entitledConnectors,
    floKitsByConnectorId,
    actionsByFloKitId,
    loading: catalogLoading,
  } = useHubEntitledCatalog(hubId,tenantId);

  useEffect(() => {
    if (isHubAdmin) fetchAll();
  }, [isHubAdmin, fetchAll]);

  // Filter tabs by permission
  const visibleTabs = TABS.filter(t => {
    if (t.adminOnly && !isHubAdmin) return false;
    if (t.permission && !isHubAdmin && !permissions.includes(t.permission)) return false;
    return true;
  });

  // Ensure activeTab is always visible
  const effectiveTab = visibleTabs.find(t => t.id === activeTab)?.id ?? visibleTabs[0]?.id ?? 'alerts';

  const existingActionNodes: ExistingActionNodeRef[] = useMemo(
    () => actionNodes.map(n => ({
      id:                   n.id,
      connectorId:          n.connectorId,
      kitId:                n.floKitId,
      actionIds:            n.actionIds ?? (n.templateActionId ? [n.templateActionId] : []),
      connectionId:         n.defaultConnectionId ?? '',
      allowedConnectionIds: n.allowedConnectionIds ?? [],
      floActionName:        n.floActionName,
      flaLabel:             n.flaLabel,
      description:          n.description,
      floActionUrlValuesByConnection: n.floActionUrlValuesByConnection,
    })),
    [actionNodes],
  );

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
            <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1 }}>Hub Admin portal</div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => enterHubConfigDocs('overview')}
            title="Live hub configuration catalog"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid #A7F3D0', background: '#ECFDF5',
              color: '#059669', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            🏢 Hub configuration
          </button>
          <button
            type="button"
            onClick={() => enterProductDocs({ category: 'product' })}
            title="Product help (opens in new tab)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid #BFDBFE', background: '#EBF2FF',
              color: '#1a56db', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            📘 Product help
          </button>
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
                onClick={() => selectTab(tab.id)}
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
              {effectiveTab === 'connections' && 'Manage authenticated connections to external systems. Credentials are stored encrypted server-side.'}
              {effectiveTab === 'actions'     && 'Browse entitled FloKit actions and register hub action nodes for the designer.'}
              {effectiveTab === 'alerts'      && 'Invalid or blocked flos — fix validation errors before webhook or scheduler can run.'}
            </div>
          </div>

          {/* Stats bars removed — each section manages its own list and counts */}

          {/* Section content */}
          {effectiveTab === 'plugs'      && <PlugsSection hubId={hubId} tenantId={tenantId} userId={userId} />}
          {effectiveTab === 'users'      && <UsersManagementSection hubId={hubId} tenantId={tenantId} userId={userId} />}
          {effectiveTab === 'scheduler'  && <SchedulerSection />}
          {effectiveTab === 'keys'       && <KeysSection />}
          {effectiveTab === 'alerts'      && (
            <FloAlertsSection hubId={hubId} tenantId={tenantId} />
          )}
          {effectiveTab === 'connections' && (
            <div style={sectionCard}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Loading connections…</div>
              ) : loadError ? (
                <div style={{ padding: 16, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#B91C1C', fontSize: 13 }}>{loadError}</div>
              ) : (
                <FloConnectionManager
                  lightTheme
                  connections={floConnections}
                  connectors={connectors}
                  protocols={protocols}
                  onSave={handleSaveFloConnection}
                  onDeactivate={handleDeactivateFloConnection}
                />
              )}
            </div>
          )}
          {effectiveTab === 'actions' && (
            <div style={sectionCard}>
              {actionSavedMsg && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, color: '#065F46', fontSize: 12 }}>
                  {actionSavedMsg}
                </div>
              )}
              {catalogLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>Loading entitled actions…</div>
              ) : (
                <FloActionManager
                  connectors={entitledConnectors}
                  floKits={floKitsByConnectorId}
                  actions={actionsByFloKitId}
                  connections={floConnections.filter(c => c.isActive)}
                  existingNodes={existingActionNodes}
                  onAddActionNode={async (params): Promise<string> => {
                    const id = await handleSaveActionNode(params);
                    setActionSavedMsg(`FloActionNode saved (${id}). Developers can pick actions and connections in the Designer.`);
                    setTimeout(() => setActionSavedMsg(''), 5000);
                    return id;
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HubAdminDashboard;
