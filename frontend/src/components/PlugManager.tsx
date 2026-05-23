/**
 * PlugManager.tsx
 *
 * Fixes in this version:
 *  1. BUG FIX — Edit plug was saving as a NEW plug because plugId was sent as
 *     `null` (via `plug?.id ?? null`). JSON serialises null as literal null,
 *     and the Cloud Function treated null as "no id → create new".
 *     Fix: send `plugId: plug?.id || undefined`. `undefined` is omitted from
 *     JSON entirely on create; on edit, `plug.id` is a non-empty string so it
 *     passes through correctly.
 *
 *  2. UI — Plug list now renders as a responsive square-tile grid with:
 *       • Connector icon/badge + plug name as title
 *       • Connector label + auth protocol badge body
 *       • Footer strip: Plug ID (monospace) + flow-usage count
 *       • Active/inactive visual state with a coloured left-border accent
 *       • Edit / Deactivate actions on hover overlay
 *
 * Security model unchanged:
 *  - NO direct Firestore reads from the frontend — all data via Cloud Functions
 *  - NO role string comparisons in UI — isAdmin is a boolean from signed token
 *  - Credentials never fetched to frontend
 *  - All mutations go through Cloud Functions
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getFunctions, httpsCallable }              from 'firebase/functions';
import type {
  AuthProtocol, AuthProtocolField,
  ConnectorDoc, PlugConfig, PlugCredentialValues, PlugVariableHint,
  TenantUser, FloMeta, PlugSummary, FloConnectionSafe, HubActionNodeDoc,
} from '@floplug/shared';
import { usePlugManagerActions }  from './../handlers/hubActionHandler';
import { NODE_TYPES }             from '@floplug/shared';

// ── Cloud Function caller helper ──────────────────────────────────────────────
const fn = <Req, Res>(name: string) =>
  httpsCallable<Req, Res>(getFunctions(), name);

// ═════════════════════════════════════════════════════════════════════════════
// InviteUserModal
// ═════════════════════════════════════════════════════════════════════════════
interface InviteUserModalProps {
  open:      boolean;
  hubId:     string;
  tenantId:  string;
  onClose:   () => void;
  onInvited: (user: TenantUser) => void;
}

const ROLE_DISPLAY: Record<string, { icon: string; label: string; desc: string }> = {
  hub_admin: { icon: '👑', label: 'Admin', desc: 'Full access — manage plugs, users, and all flos.' },
  user:      { icon: '👤', label: 'User',  desc: 'Can design flos. Run access controlled per flo.' },
};

const InviteUserModal: React.FC<InviteUserModalProps> = ({
  open, hubId, tenantId, onClose, onInvited,
}) => {
  const [email,       setEmail]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleKey,     setRoleKey]     = useState('user');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  useEffect(() => {
    if (!open) { setEmail(''); setDisplayName(''); setRoleKey('user'); setError(''); setSuccess(''); }
  }, [open]);

  const handleInvite = async () => {
    if (!email.trim() || !displayName.trim()) { setError('Email and display name are required'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const { data } = await fn<any, any>('inviteHubUser')({
        email: email.trim(), displayName: displayName.trim(),
        role: roleKey, hubId, tenantId, workspaceIds: [],
      });
      setSuccess(`Invite sent to ${email}. They will receive an email to set their password.`);
      onInvited({
        uid: data.uid, email: email.trim(), displayName: displayName.trim(),
        role: roleKey as any, hubId, tenantId,
        isActive: true, forcePasswordReset: true, workspaceIds: [], permissions: [], isHubAdmin: false,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Invite failed');
    } finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={css.overlay}>
      <div style={{ ...css.box, width: 440 }}>
        <div style={css.modalHeader}>
          <span style={css.modalTitle}>Invite Hub User</span>
          <button onClick={onClose} style={css.closeBtn}>✕</button>
        </div>
        {error   && <div style={css.errBox}>{error}</div>}
        {success && <div style={css.successBox}>{success}</div>}
        {!success && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={css.fg}>
              <label style={css.fl}>Email *</label>
              <input style={css.fi} type="email" value={email}
                placeholder="user@company.com" onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={css.fg}>
              <label style={css.fl}>Display Name *</label>
              <input style={css.fi} value={displayName}
                placeholder="Jane Smith" onChange={e => setDisplayName(e.target.value)} />
            </div>
            <div style={css.fg}>
              <label style={css.fl}>Access Level *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(ROLE_DISPLAY).map(([key, info]) => (
                  <button key={key} onClick={() => setRoleKey(key)} style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 11,
                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    border: `1.5px solid ${roleKey === key ? '#4f8ef7' : 'rgba(255,255,255,0.08)'}`,
                    background: roleKey === key ? 'rgba(79,142,247,0.12)' : 'rgba(255,255,255,0.03)',
                    color: roleKey === key ? '#4f8ef7' : '#6b6b80',
                  }}>
                    {info.icon} {info.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: '#45455a', marginTop: 4 }}>
                {ROLE_DISPLAY[roleKey]?.desc}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={onClose} style={css.btnGhost}>Cancel</button>
              <button onClick={handleInvite} disabled={saving} style={css.btnPrim}>
                {saving ? 'Sending…' : '📨 Send Invite'}
              </button>
            </div>
          </div>
        )}
        {success && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={onClose} style={css.btnPrim}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// EditUserModal
// ═════════════════════════════════════════════════════════════════════════════
interface EditUserModalProps {
  open:     boolean;
  user:     TenantUser | null;
  flos:     FloMeta[];
  hubId:    string;
  tenantId: string;
  onClose:  () => void;
  onSaved:  (updated: TenantUser) => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({
  open, user, flos, hubId, tenantId, onClose, onSaved,
}) => {
  const [roleKey,        setRoleKey]        = useState('user');
  const [allowedFlos,    setAllowedFlos]    = useState<string[]>([]);
  const [allFlos,        setAllFlos]        = useState(false);
  const [canRunDesigner, setCanRunDesigner] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  useEffect(() => {
    if (!open || !user) return;
    setRoleKey((user.role as string) ?? 'user');
    const perms = (user as any).invokePermissions ?? {};
    const uids  = perms.allowedUids ?? [];
    setAllFlos(uids.includes('*'));
    setAllowedFlos(uids.filter((u: string) => u !== '*'));
    setCanRunDesigner(perms.canRunInDesigner ?? false);
    setError('');
  }, [open, user?.uid]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true); setError('');
    try {
      const allowedUids = allFlos ? ['*'] : allowedFlos;
      await fn<any, any>('updateHubUserRole')({
        hubId, tenantId,
        targetUid:         user.uid,
        role:              roleKey,
        invokePermissions: { allowedUids, canRunInDesigner: canRunDesigner },
      });
      onSaved({ ...user, role: roleKey as any, invokePermissions: { allowedUids, canRunInDesigner: canRunDesigner } } as any);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Update failed');
    } finally { setSaving(false); }
  };

  const toggleFlow = (flowId: string) =>
    setAllowedFlos(prev => prev.includes(flowId) ? prev.filter(f => f !== flowId) : [...prev, flowId]);

  if (!open || !user) return null;
  const isUserAdmin = (user as any).isHubAdmin === true;

  return (
    <div style={css.overlay}>
      <div style={{ ...css.box, width: 500 }}>
        <div style={css.modalHeader}>
          <div>
            <span style={css.modalTitle}>Edit User</span>
            <div style={{ fontSize: 10, color: '#45455a', marginTop: 2 }}>
              {user.displayName ?? user.email} · {user.email}
            </div>
          </div>
          <button onClick={onClose} style={css.closeBtn}>✕</button>
        </div>
        {error && <div style={css.errBox}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={css.fg}>
            <label style={css.fl}>Access Level</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(ROLE_DISPLAY).map(([key, info]) => (
                <button key={key} onClick={() => setRoleKey(key)} style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 11,
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                  border: `1.5px solid ${roleKey === key ? '#4f8ef7' : 'rgba(255,255,255,0.08)'}`,
                  background: roleKey === key ? 'rgba(79,142,247,0.12)' : 'rgba(255,255,255,0.03)',
                  color: roleKey === key ? '#4f8ef7' : '#6b6b80',
                }}>
                  {info.icon} {info.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#45455a', marginTop: 4 }}>
              {ROLE_DISPLAY[roleKey]?.desc}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Flow Permissions
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Toggle value={canRunDesigner} onChange={setCanRunDesigner} color="#4f8ef7" />
              <div>
                <div style={{ fontSize: 11, color: '#d0d0e0', fontWeight: 500 }}>Can run flos in Designer</div>
                <div style={{ fontSize: 9, color: '#6b6b80', marginTop: 1 }}>If off, user can design but cannot hit the Run button</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Toggle value={allFlos} onChange={setAllFlos} color="#22c55e" />
              <div>
                <div style={{ fontSize: 11, color: '#d0d0e0', fontWeight: 500 }}>Allow invoke on all flos</div>
                <div style={{ fontSize: 9, color: '#6b6b80', marginTop: 1 }}>User can call any flow via the API endpoint</div>
              </div>
            </div>
            {!allFlos && (
              <div>
                <div style={{ fontSize: 10, color: '#6b6b80', marginBottom: 6 }}>Select flos this user can invoke externally:</div>
                {flos.length === 0
                  ? <div style={{ fontSize: 10, color: '#45455a' }}>No flos found.</div>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                      {flos.map(f => (
                        <label key={f.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
                          background: allowedFlos.includes(f.id) ? 'rgba(79,142,247,0.08)' : 'transparent',
                          border: `0.5px solid ${allowedFlos.includes(f.id) ? 'rgba(79,142,247,0.25)' : 'rgba(255,255,255,0.04)'}`,
                        }}>
                          <input type="checkbox" checked={allowedFlos.includes(f.id)}
                            onChange={() => toggleFlow(f.id)}
                            style={{ accentColor: '#4f8ef7', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: '#d0d0e0', fontWeight: 500 }}>{f.name}</div>
                            <div style={{ fontSize: 8, color: '#45455a', fontFamily: 'monospace' }}>{f.shortCode || f.id}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                }
                {allowedFlos.length === 0 && !allFlos && (
                  <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 6 }}>
                    ⚠ No flos selected — user cannot invoke any flos externally.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={css.btnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={css.btnPrim}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Toggle component ──────────────────────────────────────────────────────────
const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; color: string }> = ({ value, onChange, color }) => (
  <button onClick={() => onChange(!value)} style={{
    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
    background: value ? color : 'rgba(255,255,255,0.1)',
    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
  }}>
    <div style={{
      position: 'absolute', top: 2, borderRadius: '50%',
      width: 16, height: 16, background: '#fff',
      left: value ? 18 : 2, transition: 'left 0.2s',
    }} />
  </button>
);

// ── Placeholder helpers ───────────────────────────────────────────────────────
function defaultPlaceholder(varName: string): string {
  const v = varName.toLowerCase();
  if (v.includes('version') || v === 'ver') return 'Optional default e.g. v44.1';
  if (v.includes('port'))                   return 'Optional default e.g. 443';
  if (v.includes('region'))                 return 'Optional default e.g. us-east-1';
  if (v.includes('path'))                   return 'Optional default e.g. /api/v1';
  if (v.includes('fileName'))               return 'Attachment File Name. e.g Process_log.csv';
  return 'Optional default value';
}

function hintPlaceholder(connectorLabel: string, varName: string): string {
  const lbl = connectorLabel.toLowerCase();
  const v   = varName.toLowerCase();
  if (lbl.includes('email') || lbl.includes('smtp') || lbl.includes('mail')) {
    if (v.includes('fromemail') || v === 'from')   return 'e.g. noreply@yourcompany.com';
    if (v.includes('fromname')  || v === 'name')   return 'e.g. Company Notifications';
    if (v.includes('replyto'))                     return 'e.g. support@yourcompany.com';
    return 'e.g. your-email@company.com';
  }
  if (v.includes('host') || v.includes('url') || v.includes('base')) return `e.g. your-${lbl.split(' ')[0]}-host.com`;
  if (v.includes('tenant') || v.includes('instance') || v.includes('org')) return `e.g. your-${lbl.split(' ')[0]}-tenant-id`;
  if (v.includes('version') || v === 'ver' || v === 'api_version') return 'e.g. v44.1';
  if (v.includes('region') || v.includes('datacenter') || v.includes('dc')) return 'e.g. us-east-1';
  if (v.includes('port')) return 'e.g. 443';
  if (v.includes('path') || v.includes('endpoint') || v.includes('prefix')) return 'e.g. /api/v1';
  return `Describe this variable for ${connectorLabel || 'connector'} developers`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PlugTile — square card for the plug grid
// ─────────────────────────────────────────────────────────────────────────────
interface PlugTileProps {
  plug:       PlugSummary;
  proto?:     AuthProtocol;
  flos:       FloMeta[];
  lightTheme: boolean;
  onEdit:     () => void;
  onDeactivate: () => void;
}

/** Connector initial letter for the avatar */
const connectorInitial = (label: string) => (label ?? '?')[0].toUpperCase();

/** Pick a deterministic hue from the connector id so each connector has its own color */
function connectorColor(connectorId: string): string {
  const palette = ['#4f8ef7', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6', '#06b6d4', '#fb923c'];
  let hash = 0;
  for (let i = 0; i < connectorId.length; i++) hash = (hash * 31 + connectorId.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

const PlugTile: React.FC<PlugTileProps> = ({ plug, proto, flos, lightTheme, onEdit, onDeactivate }) => {
  const [hovered, setHovered] = useState(false);
  const color = connectorColor(plug.connectorId);
  const flowsUsingPlug = flos.filter(f => (f as any).plugIds?.includes(plug.id)).length;
  const isActive = plug.isActive ?? true;

  // ── Light theme ────────────────────────────────────────────────────────────
  if (lightTheme) {
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 14,
          border: `1.5px solid ${hovered && isActive ? color + '55' : '#E5E7EB'}`,
          background: isActive ? '#fff' : '#F9FAFB',
          boxShadow: hovered && isActive
            ? `0 4px 20px ${color}22, 0 1px 4px rgba(0,0,0,0.06)`
            : '0 1px 3px rgba(0,0,0,0.05)',
          opacity: isActive ? 1 : 0.55,
          overflow: 'hidden',
          transition: 'box-shadow 0.18s, border-color 0.18s',
          cursor: 'default',
          // Left accent border
          borderLeft: `4px solid ${isActive ? color : '#E5E7EB'}`,
        }}
      >
        {/* Body */}
        <div style={{ padding: '16px 16px 12px', flex: 1 }}>
          {/* Avatar + status row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: color + '18',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color,
            }}>
              {connectorInitial(plug.connectorLabel ?? plug.connectorId)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {!isActive && (
                <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: '#FEE2E2', color: '#DC2626', fontWeight: 600 }}>
                  INACTIVE
                </span>
              )}
              {/* Auth protocol pill */}
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                background: color + '14', color, fontWeight: 600,
                border: `0.5px solid ${color}33`,
              }}>
                {proto?.label ?? plug.authProtocol}
              </span>
            </div>
          </div>

          {/* Plug name */}
          <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#111827' : '#9CA3AF', marginBottom: 3, lineHeight: 1.3 }}>
            {plug.name}
          </div>

          {/* Connector label */}
          <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 500, marginBottom: 8 }}>
            {plug.connectorLabel ?? plug.connectorId}
          </div>

          {/* URL pattern */}
          {plug.urlPattern && (
            <div style={{
              fontSize: 9, color: '#9CA3AF', fontFamily: 'monospace',
              background: '#F3F4F6', borderRadius: 5, padding: '4px 7px',
              wordBreak: 'break-all', lineHeight: 1.5,
            }}>
              {plug.urlPattern}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #F3F4F6',
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#FAFAFA',
        }}>
          <div style={{ fontSize: 8, color: '#9CA3AF', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
            {plug.id}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {flowsUsingPlug > 0 && (
              <span style={{ fontSize: 9, color: '#4f8ef7', fontWeight: 600 }}>
                {flowsUsingPlug} flo{flowsUsingPlug !== 1 ? 's' : ''}
              </span>
            )}
            {/* Action buttons — visible on hover */}
            <div style={{
              display: 'flex', gap: 4,
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.15s',
            }}>
              <button onClick={onEdit} style={tileCss.actionBtnLight} title="Edit plug">
                ✎
              </button>
              {isActive && (
                <button onClick={onDeactivate} style={{ ...tileCss.actionBtnLight, color: '#DC2626', borderColor: '#FCA5A5' }} title="Deactivate">
                  ⏸
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Dark theme ─────────────────────────────────────────────────────────────
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        border: `1px solid ${hovered && isActive ? color + '44' : 'rgba(255,255,255,0.07)'}`,
        borderLeft: `4px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}`,
        background: hovered && isActive
          ? `linear-gradient(135deg, ${color}0a 0%, #1a1d27 100%)`
          : '#1a1d27',
        boxShadow: hovered && isActive
          ? `0 6px 24px ${color}18, 0 2px 6px rgba(0,0,0,0.3)`
          : '0 1px 4px rgba(0,0,0,0.2)',
        opacity: isActive ? 1 : 0.5,
        overflow: 'hidden',
        transition: 'box-shadow 0.18s, border-color 0.18s, background 0.18s',
        cursor: 'default',
      }}
    >
      {/* Body */}
      <div style={{ padding: '16px 16px 12px', flex: 1 }}>
        {/* Avatar + status row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: color + '1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color,
            letterSpacing: '-0.5px',
          }}>
            {connectorInitial(plug.connectorLabel ?? plug.connectorId)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            {!isActive && (
              <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(248,113,113,0.12)', color: '#f87171', fontWeight: 600 }}>
                INACTIVE
              </span>
            )}
            <span style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 10,
              background: color + '18', color, fontWeight: 600,
              border: `0.5px solid ${color}40`,
            }}>
              {proto?.label ?? plug.authProtocol}
            </span>
          </div>
        </div>

        {/* Plug name */}
        <div style={{
          fontSize: 13, fontWeight: 700, color: isActive ? '#e8e8f0' : '#45455a',
          marginBottom: 3, lineHeight: 1.3,
        }}>
          {plug.name}
        </div>

        {/* Connector label */}
        <div style={{ fontSize: 10, color: '#6b6b80', fontWeight: 500, marginBottom: 8 }}>
          {plug.connectorLabel ?? plug.connectorId}
        </div>

        {/* URL pattern */}
        {plug.urlPattern && (
          <div style={{
            fontSize: 9, color: '#45455a', fontFamily: 'monospace',
            background: 'rgba(255,255,255,0.03)', borderRadius: 5,
            padding: '4px 7px', wordBreak: 'break-all', lineHeight: 1.5,
            border: '0.5px solid rgba(255,255,255,0.04)',
          }}>
            {plug.urlPattern}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '0.5px solid rgba(255,255,255,0.06)',
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.15)',
      }}>
        <div style={{
          fontSize: 8, color: '#2e2e42', fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130,
        }}>
          {plug.id}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {flowsUsingPlug > 0 && (
            <span style={{ fontSize: 9, color: '#4f8ef7', fontWeight: 600 }}>
              {flowsUsingPlug} flo{flowsUsingPlug !== 1 ? 's' : ''}
            </span>
          )}
          <div style={{
            display: 'flex', gap: 4,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
          }}>
            <button onClick={onEdit} style={tileCss.actionBtnDark} title="Edit plug">
              ✎
            </button>
            {isActive && (
              <button onClick={onDeactivate} style={{ ...tileCss.actionBtnDark, color: '#f87171', borderColor: 'rgba(248,113,113,0.2)' }} title="Deactivate">
                ⏸
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PlugFormModal
// BUG FIX: plugId was sent as `null` on edit (plug?.id ?? null).
//   JSON serialises null as literal null — many Cloud Functions treat null the
//   same as a missing field and generate a new ID → plug saved as NEW every edit.
//   Fix: use `plug?.id || undefined`. On create: plug is null → undefined is
//   omitted from JSON. On edit: plug.id is a non-empty string → sent correctly.
// ─────────────────────────────────────────────────────────────────────────────
interface PlugFormModalProps {
  open:       boolean;
  hubId:      string;
  tenantId:   string;
  userId:     string;
  plug?:      PlugSummary | null;
  connectors: ConnectorDoc[];
  protocols:  AuthProtocol[];
  connections: FloConnectionSafe[];
  onClose:    () => void;
  onSaved:    (plug: PlugSummary) => void;
}

const PlugFormModal: React.FC<PlugFormModalProps> = ({
  open, hubId, tenantId, userId, plug,
  connectors, protocols, connections, onClose, onSaved,
}) => {
  const isEdit = !!plug;

  const [connectorId,   setConnectorId]   = useState('');
  const [authProtocol,  setAuthProtocol]  = useState('');
  const [nodeType,      setNodeType]      = useState('');
  const [name,          setName]          = useState('');
  const [urlPattern,    setUrlPattern]    = useState('');
  const [variableHints, setVariableHints] = useState<PlugVariableHint[]>([]);
  const [credentials,   setCredentials]   = useState<PlugCredentialValues>({});
  const [allowedConnectionIds, setAllowedConnectionIds] = useState<string[]>([]);
  const [defaultConnectionId,  setDefaultConnectionId]  = useState('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    if (!open) return;
    setConnectorId(plug?.connectorId   ?? '');
    setAuthProtocol(plug?.authProtocol ?? '');
    setNodeType((plug as any)?.nodeType ?? '');
    setName(plug?.name                  ?? '');
    setUrlPattern(plug?.urlPattern       ?? '');
    setVariableHints(plug?.variableHints ?? []);
    const allowed = plug?.allowedConnectionIds?.length
      ? plug.allowedConnectionIds
      : (plug?.connectionId ? [plug.connectionId] : []);
    setAllowedConnectionIds(allowed ?? []);
    setDefaultConnectionId(plug?.defaultConnectionId ?? plug?.connectionId ?? allowed[0] ?? '');
    setCredentials({});  // always blank — credentials never returned from backend
    setError(''); setSaving(false);
  }, [open, plug?.id]);

  const connectionsForPlug = useMemo(
    () => connections.filter(c =>
      c.isActive !== false
      && c.authProtocol === authProtocol
      && (!connectorId || c.connectorId === connectorId),
    ),
    [connections, authProtocol, connectorId],
  );

  const toggleAllowedConnection = (connectionId: string) => {
    setAllowedConnectionIds(prev => {
      const next = prev.includes(connectionId)
        ? prev.filter(id => id !== connectionId)
        : [...prev, connectionId];
      if (!next.includes(defaultConnectionId)) {
        setDefaultConnectionId(next[0] ?? '');
      }
      return next;
    });
  };

  const setDefaultConnection = (connectionId: string) => {
    setDefaultConnectionId(connectionId);
    if (!allowedConnectionIds.includes(connectionId)) {
      setAllowedConnectionIds(prev => [...prev, connectionId]);
    }
  };

  const connector       = connectors.find(c => c.id === connectorId) ?? null;
  const supportedProtos = protocols.filter(p => connector?.supportedAuthTypes?.includes(p.name) && p.isActive);
  const selectedProto   = protocols.find(p => p.name === authProtocol) ?? null;
  const NODE_TYPE_OPTIONS = Object.entries(NODE_TYPES).map(([key, value]) => ({ key, value }));

  const suggestNodeType = (connLabel: string, proto: string): string => {
    const lbl = connLabel.toLowerCase();
    if (proto === 'smtp_basic' || lbl.includes('email') || lbl.includes('smtp')) return NODE_TYPES.PLUG;
    if (lbl.includes('workday'))    return NODE_TYPES.WORKDAY;
    if (lbl.includes('salesforce')) return NODE_TYPES.SALESFORCE;
    if (lbl.includes('sap'))        return NODE_TYPES.SAP;
    if (lbl.includes('oracle'))     return NODE_TYPES.ORACLE;
    return NODE_TYPES.PLUG;
  };

  const handleConnectorChange = (id: string) => {
    setConnectorId(id);
    const c     = connectors.find(c => c.id === id);
    const first = protocols.find(p => c?.supportedAuthTypes?.includes(p.name) && p.isActive);
    setAuthProtocol(first?.name ?? '');
    setNodeType(suggestNodeType(c?.label ?? '', first?.name ?? ''));
    setCredentials({});
    setAllowedConnectionIds([]);
    setDefaultConnectionId('');
  };

  const patchCred = (key: string, value: string) =>
    setCredentials(prev => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!connectorId)  return 'Select a connector';
    if (!authProtocol) return 'Select an authentication protocol';
    if (!name.trim())  return 'Plug name is required';
    if (authProtocol !== 'smtp_basic' && !urlPattern.trim()) return 'URL Pattern is required';
    if (authProtocol && authProtocol !== 'smtp_basic') {
      if (allowedConnectionIds.length === 0) return 'Select at least one allowed connection.';
      if (!defaultConnectionId) return 'Mark one connection as default (★).';
      if (!allowedConnectionIds.includes(defaultConnectionId)) {
        return 'Default connection must be one of the allowed connections.';
      }
    }
    if (selectedProto && !isEdit) {
      for (const f of selectedProto.fields) {
        if (f.required && !credentials[f.name]?.trim()) return `${f.label} is required`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const validErr = validate();
    if (validErr) { setError(validErr); return; }
    setError(''); setSaving(true);
    try {
      // ── BUG FIX ──────────────────────────────────────────────────────────
      // Previously: plugId: plug?.id ?? null
      //   → On edit, plug.id is a string so this looked fine, but some paths
      //     through React state could yield plug=null in the closure, and even
      //     when plug is set, passing `null` explicitly made CFs treat it as
      //     "no id provided → create new".
      // Fix: plug?.id || undefined
      //   → On create: plug is null → undefined → field omitted from JSON ✓
      //   → On edit:   plug.id is a non-empty string → passed correctly ✓
      //   → Never sends null, which some CFs misinterpret as "create" ✓
      // ─────────────────────────────────────────────────────────────────────
      const { data } = await fn<any, any>('savePlug')({
        hubId,
        tenantId,
        userId,
        plugId:         plug?.id || undefined,   // ← THE FIX
        connectorId,
        connectorLabel: connector?.label ?? connectorId,
        authProtocol,
        nodeType,
        name:           name.trim(),
        urlPattern:     urlPattern.trim(),
        variableHints,
        credentials,
        allowedConnectionIds,
        defaultConnectionId,
        isActive:       true,
      });

      onSaved({
        id:             data.plugId ?? data.id ?? plug?.id ?? '',
        hubId,
        tenantId,
        connectorId,
        connectorLabel: connector?.label ?? connectorId,
        authProtocol,
        nodeType,
        name:           name.trim(),
        urlPattern:     urlPattern.trim(),
        variableHints,
        allowedConnectionIds,
        defaultConnectionId,
        connectionId:   defaultConnectionId,
        isActive:       true,
        createdBy:      plug?.createdBy ?? userId,
        updatedBy:      userId,
        updatedAt:      new Date(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Save failed');
    } finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={css.overlay}>
      <div style={{ ...css.box, width: 580 }}>
        <div style={css.modalHeader}>
          <div>
            <span style={css.modalTitle}>{isEdit ? 'Edit Plug' : 'New Plug'}</span>
            {isEdit && plug && (
              <div style={{ fontSize: 10, color: '#45455a', marginTop: 2, fontFamily: 'monospace' }}>
                ID: {plug.id}
              </div>
            )}
          </div>
          <button onClick={onClose} style={css.closeBtn}>✕</button>
        </div>
        {error && <div style={css.errBox}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Connector */}
          {!isEdit ? (
            <div style={css.fg}>
              <label style={css.fl}>Connector *</label>
              {connectors.length === 0
                ? <div style={{ fontSize: 11, color: '#f59e0b' }}>No active connectors found.</div>
                : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {connectors.map(c => (
                      <button key={c.id} onClick={() => handleConnectorChange(c.id)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 11,
                        cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                        border: `1.5px solid ${connectorId === c.id ? '#4f8ef7' : 'rgba(255,255,255,0.08)'}`,
                        background: connectorId === c.id ? 'rgba(79,142,247,0.12)' : 'rgba(255,255,255,0.03)',
                        color: connectorId === c.id ? '#4f8ef7' : '#6b6b80',
                      }}>{c.label}</button>
                    ))}
                  </div>
              }
            </div>
          ) : (
            <div style={css.fg}>
              <label style={css.fl}>Connector</label>
              <div style={{ padding: '7px 10px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', fontSize: 12, color: '#6b6b80' }}>
                {connector?.label ?? connectorId}
                <span style={{ marginLeft: 8, fontSize: 10, color: '#45455a' }}>(cannot change on edit)</span>
              </div>
            </div>
          )}

          {/* Auth Protocol */}
          {connectorId && (
            <div style={css.fg}>
              <label style={css.fl}>Authentication Protocol *</label>
              {isEdit
                ? <div style={{ padding: '7px 10px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', fontSize: 12, color: '#6b6b80' }}>
                    {selectedProto?.label ?? authProtocol}
                    <span style={{ marginLeft: 8, fontSize: 10, color: '#45455a' }}>(cannot change on edit)</span>
                  </div>
                : supportedProtos.length <= 1
                  ? <div style={{ fontSize: 12, color: '#9090a0' }}>{supportedProtos[0]?.label ?? 'None available'}</div>
                  : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {supportedProtos.map(p => (
                        <button key={p.name} onClick={() => { setAuthProtocol(p.name); setCredentials({}); }} style={{
                          padding: '5px 12px', borderRadius: 6, fontSize: 11,
                          cursor: 'pointer', fontFamily: 'inherit',
                          border: `1.5px solid ${authProtocol === p.name ? '#0f766e' : 'rgba(255,255,255,0.08)'}`,
                          background: authProtocol === p.name ? 'rgba(15,118,110,0.12)' : 'rgba(255,255,255,0.03)',
                          color: authProtocol === p.name ? '#0f766e' : '#6b6b80',
                        }}>{p.label}</button>
                      ))}
                    </div>
              }
            </div>
          )}

          {/* Name + Node Type + URL + Hints */}
          {authProtocol && (
            <>
              <div style={css.fg}>
                <label style={css.fl}>Plug Name *</label>
                <input style={css.fi} value={name} placeholder="e.g. Workday Production"
                  onChange={e => setName(e.target.value)} />
              </div>

              <div style={css.fg}>
                <label style={css.fl}>Node Type *
                  <span style={{ marginLeft: 6, fontSize: 9, color: '#45455a' }}>
                    Controls how the execution engine routes this plug
                  </span>
                </label>
                <select style={css.fi} value={nodeType} onChange={e => setNodeType(e.target.value)}>
                  <option value="">— Select node type —</option>
                  {NODE_TYPE_OPTIONS
                    .filter(o => !['START', 'END'].includes(o.key))
                    .map(o => (
                      <option key={o.key} value={o.value}>
                        {o.key.replace(/_/g, ' ')} — {o.value}
                      </option>
                    ))
                  }
                </select>
              </div>

              {authProtocol !== 'smtp_basic' && (
                <div style={css.fg}>
                  <label style={css.fl}>URL Pattern *</label>
                  <input style={css.fi} value={urlPattern}
                    placeholder="https://{{hostname}}/ccx/service/{{tenant}}/{{module}}/{{version}}"
                    onChange={e => setUrlPattern(e.target.value)} />
                  <div style={{ fontSize: 9, color: '#3a3a50', marginTop: 3 }}>
                    Use {'{{variableName}}'} for values the developer fills at design time.
                  </div>
                </div>
              )}

              {authProtocol && authProtocol !== 'smtp_basic' && (
                <div style={css.fg}>
                  <label style={css.fl}>
                    Allowed connections *
                    <span style={{ marginLeft: 6, fontSize: 9, color: '#45455a', fontWeight: 400 }}>
                      (developers pick one · ★ = default)
                    </span>
                  </label>
                  {connectionsForPlug.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#f59e0b', padding: '8px 10px', borderRadius: 6, background: 'rgba(245,158,11,0.08)' }}>
                      No active connections for <strong>{authProtocol}</strong>. Create connections in Hub Admin → Connections first.
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      padding: '10px 12px', borderRadius: 8,
                      border: '0.5px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.02)',
                    }}>
                      {connectionsForPlug.map(conn => (
                        <label
                          key={conn.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={allowedConnectionIds.includes(conn.id)}
                            onChange={() => toggleAllowedConnection(conn.id)}
                          />
                          <span style={{ flex: 1, color: '#c0c0cc' }}>
                            {conn.name}
                            {conn.environmentLabel && (
                              <span style={{ color: '#6b6b80', marginLeft: 6 }}>({conn.environmentLabel})</span>
                            )}
                          </span>
                          <input
                            type="radio"
                            name="plug-default-connection"
                            checked={defaultConnectionId === conn.id}
                            disabled={!allowedConnectionIds.includes(conn.id)}
                            onChange={() => setDefaultConnection(conn.id)}
                          />
                          <span style={{
                            fontSize: 10,
                            color: defaultConnectionId === conn.id ? '#4f8ef7' : '#45455a',
                          }}>
                            ★ default
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {authProtocol === 'smtp_basic' ? (
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '0.5px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    ✉ Email Plug — Credentials Only
                  </div>
                  <div style={{ fontSize: 9, color: '#9090a0', lineHeight: 1.6 }}>
                    This plug stores your SMTP credentials securely.<br />
                    Developers configure <strong style={{ color: '#f0f0f4' }}>To / CC / BCC / Subject / Body</strong> when
                    they drag this plug onto the designer canvas — not here.
                  </div>
                </div>
              ) : (
                (() => {
                  const vars = [...(urlPattern.matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]);
                  if (!vars.length) return null;
                  return (
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#4f8ef7', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                        URL Variable Hints
                      </div>
                      {vars.map(varName => {
                        const existing = variableHints.find(h => h.name === varName) ?? { name: varName, hint: '', defaultValue: '' };
                        const upd = (patch: Partial<PlugVariableHint>) =>
                          setVariableHints(prev => {
                            const idx = prev.findIndex(h => h.name === varName);
                            const u   = { ...existing, ...patch };
                            return idx >= 0 ? prev.map((h, i) => i === idx ? u : h) : [...prev, u];
                          });
                        return (
                          <div key={varName} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: 10, color: '#4f8ef7', fontFamily: 'monospace', marginBottom: 6 }}>{`{{${varName}}}`}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              <input style={css.fi} placeholder={hintPlaceholder(connector?.label ?? '', varName)}
                                value={existing.hint ?? ''} onChange={e => upd({ hint: e.target.value })} />
                              <input style={css.fi} placeholder={defaultPlaceholder(varName)}
                                value={existing.defaultValue ?? ''} onChange={e => upd({ defaultValue: e.target.value })} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </>
          )}

          {/* Credentials */}
          {selectedProto && selectedProto.fields.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4f8ef7', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Credentials — {selectedProto.label}
              </div>
              {isEdit && (
                <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 10, lineHeight: 1.5 }}>
                  🔒 Credentials are stored encrypted and never returned to the browser.
                  Leave a field blank to keep its current value.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedProto.fields.map((f: AuthProtocolField) => (
                  <div key={f.name} style={css.fg}>
                    <label style={css.fl}>
                      {f.label}
                      {f.required && !isEdit && <span style={{ color: '#f87171' }}> *</span>}
                      {f.requiresMasking && <span style={{ marginLeft: 6, fontSize: 9, color: '#f59e0b' }}>🔒 encrypted</span>}
                    </label>
                    {f.fieldType === 'textarea'
                      ? <textarea style={{ ...css.fi, minHeight: 70, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
                          value={credentials[f.name] ?? ''}
                          placeholder={isEdit ? '(leave blank to keep current)' : (f.placeholder ?? '')}
                          onChange={e => patchCred(f.name, e.target.value)} />
                      : f.fieldType === 'select' && f.options
                        ? <select style={css.fi} value={credentials[f.name] ?? ''} onChange={e => patchCred(f.name, e.target.value)}>
                            <option value="">— Select —</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        : <input style={css.fi}
                            type={f.requiresMasking ? 'password' : f.fieldType === 'url' ? 'url' : 'text'}
                            value={credentials[f.name] ?? ''}
                            placeholder={isEdit ? '(leave blank to keep current)' : (f.placeholder ?? '')}
                            autoComplete={f.requiresMasking ? 'new-password' : 'off'}
                            onChange={e => patchCred(f.name, e.target.value)} />
                    }
                    {f.helpText && <div style={{ fontSize: 10, color: '#6b6b80', marginTop: 2 }}>{f.helpText}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={css.btnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={css.btnPrim}>
            {saving ? 'Saving…' : isEdit ? 'Update Plug' : 'Create Plug'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// PlugManager — main component
// ═════════════════════════════════════════════════════════════════════════════
interface Props {
  hubId:          string;
  tenantId:       string;
  userId:         string;
  isAdmin:        boolean;
  onPlugCreated?: (plug: PlugSummary) => void;
  section?:       'plugs' | 'users';
  lightTheme?:    boolean;
}

const PlugManager: React.FC<Props> = ({
  hubId, tenantId, userId, isAdmin, onPlugCreated, section, lightTheme = false,
}) => {
  const [tab,              setTab]             = useState<'plugs' | 'users'>(section ?? 'plugs');
  const [plugs,            setPlugs]           = useState<PlugSummary[]>([]);
  const [users,            setUsers]           = useState<TenantUser[]>([]);
  const [flos,             setFlos]            = useState<FloMeta[]>([]);
  const [connectors,       setConnectors]      = useState<ConnectorDoc[]>([]);
  const [protocols,        setProtocols]       = useState<AuthProtocol[]>([]);
  const [floConnections,   setFloConnections]  = useState<FloConnectionSafe[]>([]);
  const [_actionNodes,     setActionNodes]     = useState<HubActionNodeDoc[]>([]);
  const [loading,          setLoading]         = useState(true);
  const [loadError,        setLoadError]       = useState('');
  const [plugModal,        setPlugModal]       = useState(false);
  const [editPlug,         setEditPlug]        = useState<PlugSummary | null>(null);
  const [inviteModal,      setInviteModal]     = useState(false);
  const [editUser,         setEditUser]        = useState<TenantUser | null>(null);

  const {
    fetchAll,
    handleDeactivatePlug,
    handleDeactivateUser,
    handleReactivateUser,
    handleUserInvited,
    handleUserSaved,
    handlePlugSaved: _handlePlugSaved,
  } = usePlugManagerActions({
    hubId, tenantId, isAdmin, userId,
    setPlugs, setUsers, setFlos, setConnectors, setProtocols,
    setFloConnections, setActionNodes, setLoading, setLoadError,
  });

  const handlePlugSaved = (plug: PlugSummary) => {
    _handlePlugSaved(plug);
    onPlugCreated?.(plug);
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  if (!isAdmin) return null;

  return (
    <>
      <div style={lightTheme ? lCss.panel : css.panel}>

        {/* Tab header */}
        {!section && (
          <div style={lightTheme ? lCss.panelHeader : css.panelHeader}>
            <span style={{ fontSize: 12, fontWeight: 700, color: lightTheme ? '#111827' : '#f0f0f4' }}>Hub Manager</span>
            <div style={{ display: 'flex', gap: 2, marginLeft: 12 }}>
              {(['plugs', 'users'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '4px 12px', borderRadius: 5, border: 'none',
                  background: tab === t
                    ? (lightTheme ? '#EBF2FF' : 'rgba(79,142,247,0.15)')
                    : 'transparent',
                  color: tab === t ? '#1a56db' : (lightTheme ? '#6B7280' : '#6b6b80'),
                  fontSize: 11, fontWeight: tab === t ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                }}>{t}</button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div style={lightTheme ? lCss.content : { flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ fontSize: 12, color: '#45455a', padding: 20, textAlign: 'center' }}>Loading…</div>
          ) : loadError ? (
            <div style={{ ...css.errBox, margin: 0 }}>{loadError}</div>
          ) : tab === 'plugs' ? (
            <>
              {/* Plugs header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: lightTheme ? '#6B7280' : '#6b6b80' }}>
                  {plugs.length} plug{plugs.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => { setEditPlug(null); setPlugModal(true); }}
                  style={css.btnPrim}
                >
                  + New Plug
                </button>
              </div>

              {/* Empty state */}
              {plugs.length === 0 && (
                <div style={css.emptyState}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔌</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: lightTheme ? '#374151' : '#6b6b80' }}>No plugs yet</div>
                  <div style={{ fontSize: 11, color: lightTheme ? '#9CA3AF' : '#45455a', marginTop: 4 }}>
                    Create a plug to configure a connector for this tenant.
                  </div>
                </div>
              )}

              {/* ── Square tile grid ──────────────────────────────────────── */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 14,
              }}>
                {plugs.map(plug => {
                  const proto = protocols.find(p => p.name === plug.authProtocol);
                  return (
                    <PlugTile
                      key={plug.id}
                      plug={plug}
                      proto={proto}
                      flos={flos}
                      lightTheme={lightTheme}
                      onEdit={() => { setEditPlug(plug); setPlugModal(true); }}
                      onDeactivate={() => handleDeactivatePlug(plug)}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            /* ── Users tab ─────────────────────────────────────────────── */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: lightTheme ? '#6B7280' : '#6b6b80' }}>
                  {users.length} user{users.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => setInviteModal(true)} style={css.btnPrim}>+ Invite User</button>
              </div>

              {users.length === 0 && (
                <div style={css.emptyState}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
                  <div style={{ fontSize: 13, color: lightTheme ? '#374151' : '#6b6b80' }}>No users yet</div>
                  <div style={{ fontSize: 11, color: lightTheme ? '#9CA3AF' : '#45455a', marginTop: 4 }}>
                    Invite users to give them access to this hub.
                  </div>
                </div>
              )}

              {users.map(u => {
                const perms      = (u as any).invokePermissions ?? {};
                const allFlosOk  = perms.allowedUids?.includes('*');
                const flowCount  = allFlosOk ? null : (perms.allowedUids?.length ?? 0);
                const canRun     = perms.canRunInDesigner ?? false;
                const isHubAdmin = (u as any).isHubAdmin === true;
                const roleLabel  = ROLE_DISPLAY[(u.role as string)] ?? ROLE_DISPLAY['user'];

                return (
                  <div key={u.uid} style={lightTheme ? lCss.card(u.isActive ?? true) : css.card(u.isActive ?? true)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: isHubAdmin ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        color: isHubAdmin ? '#4f8ef7' : '#6b6b80',
                      }}>
                        {(u.displayName ?? u.email ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: (u.isActive ?? true) ? (lightTheme ? '#111827' : '#d0d0dc') : '#45455a' }}>
                            {u.displayName ?? u.email}
                          </span>
                          <span style={{
                            fontSize: 8, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
                            background: isHubAdmin ? 'rgba(79,142,247,0.12)' : 'rgba(255,255,255,0.05)',
                            color: isHubAdmin ? '#4f8ef7' : '#6b6b80',
                          }}>
                            {roleLabel.icon} {roleLabel.label}
                          </span>
                          {!(u.isActive ?? true) && (
                            <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>INACTIVE</span>
                          )}
                        </div>
                        <div style={{ fontSize: 9, color: lightTheme ? '#9CA3AF' : '#45455a', marginBottom: 4 }}>{u.email}</div>
                        {!isHubAdmin && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 3,
                              background: canRun ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                              color: canRun ? '#22c55e' : '#45455a',
                              border: `0.5px solid ${canRun ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}`,
                            }}>
                              {canRun ? '▶ Can run in designer' : '⊘ Cannot run in designer'}
                            </span>
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 3,
                              background: allFlosOk ? 'rgba(34,197,94,0.08)' : flowCount ? 'rgba(79,142,247,0.08)' : 'rgba(255,255,255,0.04)',
                              color: allFlosOk ? '#22c55e' : flowCount ? '#4f8ef7' : '#45455a',
                              border: `0.5px solid ${allFlosOk ? 'rgba(34,197,94,0.2)' : flowCount ? 'rgba(79,142,247,0.2)' : 'rgba(255,255,255,0.06)'}`,
                            }}>
                              {allFlosOk ? '🌐 All flos' : flowCount ? `${flowCount} flo${flowCount !== 1 ? 's' : ''}` : '⊘ No flos'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => setEditUser(u)} style={css.actionBtn} title="Edit user">✎</button>
                        {(u.isActive ?? true)
                          ? <button onClick={() => handleDeactivateUser(u)} style={{ ...css.actionBtn, color: '#f87171' }} title="Deactivate">⏸</button>
                          : <button onClick={() => handleReactivateUser(u)} style={{ ...css.actionBtn, color: '#22c55e' }} title="Reactivate">▶</button>
                        }
                      </div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 8, color: '#2a2a38', fontFamily: 'monospace' }}>UID: {u.uid}</div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      <PlugFormModal
        open={plugModal} hubId={hubId} tenantId={tenantId} userId={userId}
        plug={editPlug} connectors={connectors} protocols={protocols}
        connections={floConnections}
        onClose={() => { setPlugModal(false); setEditPlug(null); }}
        onSaved={handlePlugSaved}
      />

      <InviteUserModal
        open={inviteModal} hubId={hubId} tenantId={tenantId}
        onClose={() => setInviteModal(false)}
        onInvited={handleUserInvited}
      />

      <EditUserModal
        open={!!editUser} user={editUser} flos={flos}
        hubId={hubId} tenantId={tenantId}
        onClose={() => setEditUser(null)}
        onSaved={updated => { handleUserSaved(updated); setEditUser(null); }}
      />
    </>
  );
};

// ── Tile button styles ────────────────────────────────────────────────────────
const tileCss = {
  actionBtnLight: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    color: '#374151',
    fontSize: 11,
    cursor: 'pointer',
    padding: '3px 8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  } as React.CSSProperties,
  actionBtnDark: {
    background: 'rgba(255,255,255,0.06)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#9090a0',
    fontSize: 11,
    cursor: 'pointer',
    padding: '3px 8px',
  } as React.CSSProperties,
};

// ── Shared modal/panel styles ─────────────────────────────────────────────────
const css = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' } as React.CSSProperties,
  box:         { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '24px 28px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: "'Inter',-apple-system,sans-serif" } as React.CSSProperties,
  modalHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 } as React.CSSProperties,
  modalTitle:  { fontSize: 14, fontWeight: 600, color: '#f0f0f4' } as React.CSSProperties,
  closeBtn:    { background: 'none', border: 'none', color: '#6b6b80', fontSize: 14, cursor: 'pointer', flexShrink: 0 } as React.CSSProperties,
  errBox:      { background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.2)', borderRadius: 7, padding: '8px 12px', color: '#f87171', fontSize: 12, marginBottom: 14 } as React.CSSProperties,
  successBox:  { background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.2)', borderRadius: 7, padding: '8px 12px', color: '#22c55e', fontSize: 12, marginBottom: 14 } as React.CSSProperties,
  fg:          { display: 'flex', flexDirection: 'column', gap: 5 } as React.CSSProperties,
  fl:          { fontSize: 11, fontWeight: 500, color: '#9090a0' } as React.CSSProperties,
  fi:          { padding: '7px 10px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  btnGhost:    { padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#9090a0' } as React.CSSProperties,
  btnPrim:     { padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#4f8ef7', color: '#fff' } as React.CSSProperties,
  actionBtn:   { background: 'none', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 5, color: '#6b6b80', fontSize: 12, cursor: 'pointer', padding: '3px 7px' } as React.CSSProperties,
  emptyState:  { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' } as React.CSSProperties,
  panel:       { display: 'flex', flexDirection: 'column', height: '100%', background: '#141720', fontFamily: "'Inter',-apple-system,sans-serif" } as React.CSSProperties,
  panelHeader: { height: 46, background: '#181b24', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 } as React.CSSProperties,
  card:        (active: boolean): React.CSSProperties => ({
    background: '#1a1d27',
    border: `0.5px solid ${active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
    borderRadius: 8, padding: '10px 12px', marginBottom: 8, opacity: active ? 1 : 0.6,
  }),
};

// ── Light theme styles ────────────────────────────────────────────────────────
const lCss = {
  panel:       { display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', fontFamily: "'Inter',-apple-system,sans-serif", borderRadius: 12 } as React.CSSProperties,
  panelHeader: { height: 46, background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0, borderRadius: '12px 12px 0 0' } as React.CSSProperties,
  content:     { flex: 1, overflowY: 'auto', padding: '16px 20px' } as React.CSSProperties,
  card:        (active: boolean): React.CSSProperties => ({
    background: active ? '#fff' : '#F9FAFB',
    border: `1px solid ${active ? '#E5E7EB' : '#F3F4F6'}`,
    borderRadius: 10, padding: '12px 14px', marginBottom: 10,
    opacity: active ? 1 : 0.65,
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
  }),
};

export default PlugManager;
