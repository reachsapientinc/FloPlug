/**
 * PlugManager.tsx
 *
 * Security model:
 *  - NO direct Firestore reads from the frontend — all data via Cloud Functions
 *  - NO role string comparisons in UI — parent passes isAdmin as a boolean
 *    derived from the signed Firebase token claim
 *  - Credentials never fetched to frontend — plug list omits credential fields
 *  - All mutations go through Cloud Functions which verify caller identity
 *
 * Cloud Functions used:
 *  - getHubPlugs(hubId, tenantId)         → returns plugs WITHOUT credentials
 *  - getHubUsers(hubId, tenantId)         → returns users
 *  - getHubFlos(hubId, tenantId)         → returns flow metadata only
 *  - savePlug(plugData)                   → create/update plug including credentials
 *  - deactivatePlug(hubId, tenantId, id)  → soft delete
 *  - inviteHubUser(...)                   → invite + Firebase Auth + Firestore
 *  - updateHubUserRole(...)               → role + permissions update
 *  - deactivateHubUser(hubId,tenantId,uid)
 *  - reactivateHubUser(hubId,tenantId,uid)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable }              from 'firebase/functions';
import type {
  AuthProtocol, AuthProtocolField,
  ConnectorDoc, PlugConfig, PlugCredentialValues, PlugVariableHint,TenantUser,FloMeta,PlugSummary,
}  from '@floplug/shared';
//import {loadConnectors,loadAuthProtocols} from './../types/AuthConnectorTypes.ts';                                                 
import {
  usePlugManagerActions,
}                                                 from './../handlers/hubActionHandler';
import { NODE_TYPES }                             from '@floplug/shared';

// ── Cloud Function caller helper ──────────────────────────────────────────────
const fn = <Req, Res>(name: string) =>
  httpsCallable<Req, Res>(getFunctions(), name);

// ── Types ─────────────────────────────────────────────────────────────────────
// interface FloMeta {
//   id:          string;
//   name:        string;
//   shortCode:   string;
//   workspaceId: string;
// }

// PlugSummary — what the frontend receives (no credentials field)
//type PlugSummary = Omit<PlugConfig, 'credentials'>;

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

// Role labels — only used for display, never for access control logic
const ROLE_DISPLAY: Record<string, { icon: string; label: string; desc: string }> = {
  hub_admin: { icon: '👑', label: 'Admin',     desc: 'Full access — manage plugs, users, and all flos.' },
  user:      { icon: '👤', label: 'User',       desc: 'Can design flos. Run access controlled per flo.' },
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
      // Cloud Function creates Firebase Auth user + Firestore doc + sends email
      // Frontend never touches Firestore directly
      const { data } = await fn<any, any>('inviteHubUser')({
        email: email.trim(), displayName: displayName.trim(),
        role: roleKey, hubId, tenantId, workspaceIds: [],
      });
      setSuccess(`Invite sent to ${email}. They will receive an email to set their password.`);
      onInvited({
        uid: data.uid, email: email.trim(), displayName: displayName.trim(),
        role: roleKey as any, hubId, tenantId,
        isActive: true, forcePasswordReset: true, workspaceIds: [],permissions:[],isHubAdmin:false
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
  const [allowedFlos,   setAllowedFlos]   = useState<string[]>([]);
  const [allFlos,       setAllFlos]       = useState(false);
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
      // All updates go through Cloud Function — never direct Firestore write
      // Function verifies caller is hub_admin via token claims
      await fn<any, any>('updateHubUserRole')({
        hubId, tenantId,
        targetUid:    user.uid,
        role:         roleKey,
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

  const isUserAdmin = (user as any).isHubAdmin === true; // boolean flag from token, not role string

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

          {/* Access level — display labels only, actual role sent to function */}
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

          {/* Flow permissions */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#16de1d', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Flow Permissions
            </div>

            {/* Can run in designer toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Toggle value={canRunDesigner} onChange={setCanRunDesigner} color="#4f8ef7" />
              <div>
                <div style={{ fontSize: 11, color: '#d0d0e0', fontWeight: 500 }}>Can run flos in Designer</div>
                <div style={{ fontSize: 9, color: '#16de1d', marginTop: 1 }}>If off, user can design but cannot hit the Run button</div>
              </div>
            </div>

            {/* All flos toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Toggle value={allFlos} onChange={setAllFlos} color="#22c55e" />
              <div>
                <div style={{ fontSize: 11, color: '#d0d0e0', fontWeight: 500 }}>Allow invoke on all flos</div>
                <div style={{ fontSize: 9, color: '#16de1d', marginTop: 1 }}>User can call any flow via the API endpoint</div>
              </div>
            </div>

            {/* Specific flow selector */}
            {!allFlos && (
              <div>
                <div style={{ fontSize: 10, color: '#6b6b80', marginBottom: 6 }}>Select flos this user can invoke externally:</div>
                {flos.length === 0
                  ? <div style={{ fontSize: 10, color: '#16de1d' }}>No flos found.</div>
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
                            <div style={{ fontSize: 8, color: '#16de1d', fontFamily: 'monospace' }}>{f.shortCode || f.id}</div>
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

function defaultPlaceholder(varName: string): string {
  const v = varName.toLowerCase();
  if (v.includes('version') || v === 'ver') return 'Optional default e.g. v44.1';
  if (v.includes('port'))                   return 'Optional default e.g. 443';
  if (v.includes('region'))                 return 'Optional default e.g. us-east-1';
  if (v.includes('path'))                   return 'Optional default e.g. /api/v1';
  if (v.includes('fileName'))                   return 'Attachment File Name.  e.g Process_log.csv';
  return 'Optional default value';
}

// ── Dynamic hint placeholder ───────────────────────────────────────────────
// Derives a context-aware placeholder from the connector label and variable name
// so admins see relevant guidance instead of a hardcoded Workday example.

function hintPlaceholder(connectorLabel: string, varName: string): string {
  const lbl = connectorLabel.toLowerCase();
  const v   = varName.toLowerCase();

  // Email / SMTP hints
  if (lbl.includes('email') || lbl.includes('smtp') || lbl.includes('mail')) {
    if (v.includes('fromemail') || v === 'from')   return 'e.g. noreply@yourcompany.com';
    if (v.includes('fromname')  || v === 'name')   return 'e.g. Company Notifications';
    if (v.includes('replyto'))                     return 'e.g. support@yourcompany.com';
    if (v.includes('fileName'))                   return 'Attachment File Name.  e.g Process_log.csv';
    return 'e.g. your-email@company.com';
  }

  // URL / host hints
  if (v.includes('host') || v.includes('url') || v.includes('base')) {
    return `e.g. your-${lbl.split(' ')[0]}-host.com`;
  }

  // Tenant / instance hints
  if (v.includes('tenant') || v.includes('instance') || v.includes('org')) {
    return `e.g. your-${lbl.split(' ')[0]}-tenant-id`;
  }

  // Version hints
  if (v.includes('version') || v === 'ver' || v === 'api_version') {
    return 'e.g. v44.1';
  }

  // Region / datacenter hints
  if (v.includes('region') || v.includes('datacenter') || v.includes('dc')) {
    return 'e.g. us-east-1';
  }

  // Port hints
  if (v.includes('port')) {
    return 'e.g. 443';
  }

  // Path / endpoint hints
  if (v.includes('path') || v.includes('endpoint') || v.includes('prefix')) {
    return `e.g. /api/v1`;
  }

  // Generic fallback — uses connector name so still relevant
  const connName = connectorLabel || 'connector';
  return `Describe this variable for ${connName} developers`;
}

// ═════════════════════════════════════════════════════════════════════════════
// PlugFormModal
// ═════════════════════════════════════════════════════════════════════════════
interface PlugFormModalProps {
  open:       boolean;
  hubId:      string;
  tenantId:   string;
  userId:     string;
  plug?:      PlugSummary | null;
  connectors: ConnectorDoc[];
  protocols:  AuthProtocol[];
  onClose:    () => void;
  onSaved:    (plug: PlugSummary) => void;
}

const PlugFormModal: React.FC<PlugFormModalProps> = ({
  open, hubId, tenantId, userId, plug,
  connectors, protocols, onClose, onSaved,
}) => {
  const isEdit = !!plug;

  const [connectorId,   setConnectorId]   = useState('');
  const [authProtocol,  setAuthProtocol]  = useState('');
  const [nodeType,      setNodeType]      = useState('');   // which NODE_TYPES key routes this plug
  const [name,          setName]          = useState('');
  const [urlPattern,    setUrlPattern]    = useState('');
  const [variableHints, setVariableHints] = useState<PlugVariableHint[]>([]);
  const [credentials,   setCredentials]   = useState<PlugCredentialValues>({});
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => {
    if (!open) return;
    setConnectorId(plug?.connectorId   ?? '');
    setAuthProtocol(plug?.authProtocol ?? '');
    setNodeType((plug as any)?.nodeType ?? '');
    setName(plug?.name                 ?? '');
    setUrlPattern(plug?.urlPattern      ?? '');
    setVariableHints(plug?.variableHints ?? []);
    setCredentials({});  // always start blank — credentials never returned from backend
    setError(''); setSaving(false);
  }, [open, plug?.id]);

  const connector     = connectors.find(c => c.id === connectorId) ?? null;
  const supportedProtos = protocols.filter(p => connector?.supportedAuthTypes?.includes(p.name) && p.isActive);
  const selectedProto   = protocols.find(p => p.name === authProtocol) ?? null;

  // NODE_TYPES values available as options — auto-suggest based on connector label
  const NODE_TYPE_OPTIONS = Object.entries(NODE_TYPES).map(([key, value]) => ({ key, value }));

  const suggestNodeType = (connLabel: string, proto: string): string => {
    const lbl = connLabel.toLowerCase();
    if (proto === 'smtp_basic' || lbl.includes('email') || lbl.includes('smtp')) return NODE_TYPES.PLUG;
    if (lbl.includes('workday'))    return NODE_TYPES.WORKDAY;
    if (lbl.includes('salesforce')) return NODE_TYPES.SALESFORCE;
    if (lbl.includes('sap'))        return NODE_TYPES.SAP;
    if (lbl.includes('oracle'))     return NODE_TYPES.ORACLE;
    return NODE_TYPES.PLUG;  // default — generic plug node
  };

  const handleConnectorChange = (id: string) => {
    setConnectorId(id);
    const c     = connectors.find(c => c.id === id);
    const first = protocols.find(p => c?.supportedAuthTypes?.includes(p.name) && p.isActive);
    setAuthProtocol(first?.name ?? '');
    setNodeType(suggestNodeType(c?.label ?? '', first?.name ?? ''));
    setCredentials({});
  };

  const patchCred = (key: string, value: string) =>
    setCredentials(prev => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!connectorId)       return 'Select a connector';
    if (!authProtocol)      return 'Select an authentication protocol';
    if (!name.trim())       return 'Plug name is required';
    if (authProtocol !== 'smtp_basic' && !urlPattern.trim()) {
      return 'URL Pattern is required';
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
      // All plug saves including credentials go through Cloud Function
      // This ensures credentials never flow through Firestore rules
      // and the function verifies the caller is hub_admin via token claims
      const { data } = await fn<any, any>('savePlug')({
        hubId, tenantId, userId,
        plugId:      plug?.id ?? null,
        connectorId,
        connectorLabel: connector?.label ?? connectorId,
        authProtocol,
        nodeType,    // stored on plug so the engine can route without guessing
        name:        name.trim(),
        urlPattern:  urlPattern.trim(),
        variableHints,
        credentials, // only fields the user filled in — blanks keep existing on edit
        isActive:    true,
      });

      onSaved({
        id: data.plugId ?? plug?.id ?? '',
        hubId, tenantId, connectorId,
        connectorLabel: connector?.label ?? connectorId,
        authProtocol,
        nodeType,
        name:          name.trim(),
        urlPattern:    urlPattern.trim(),
        variableHints,
        isActive:      true,
        createdBy:     plug?.createdBy ?? userId,
        updatedBy:     userId,
        updatedAt:     new Date(),
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
                <span style={{ marginLeft: 8, fontSize: 10, color: '#16de1d' }}>(cannot change on edit)</span>
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
                    <span style={{ marginLeft: 8, fontSize: 10, color: '#16de1d' }}>(cannot change on edit)</span>
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

          {/* Name + URL Pattern + Hints */}
          {authProtocol && (
            <>
              
              <div style={css.fg}>
                <label style={css.fl}>Plug Name *</label>
                <input style={css.fi} value={name} placeholder="e.g. Workday Production"
                  onChange={e => setName(e.target.value)} />
              </div>

              {/* Node Type — controls how the engine routes this plug */}
              <div style={css.fg}>
                <label style={css.fl}>Node Type *
                  <span style={{ marginLeft: 6, fontSize: 9, color: '#45455a' }}>
                    Controls how the execution engine routes and renders this plug
                  </span>
                </label>
                <select
                  style={css.fi}
                  value={nodeType}
                  onChange={e => setNodeType(e.target.value)}
                >
                  <option value="">— Select node type —</option>
                  {NODE_TYPE_OPTIONS
                    .filter(o => !['START','END'].includes(o.key)) // Start/End are structural, not plugs
                    .map(o => (
                      <option key={o.key} value={o.value}>
                        {o.key.replace(/_/g, ' ')} — {o.value}
                      </option>
                    ))
                  }
                </select>
                {nodeType && (
                  <div style={{ fontSize: 9, color: '#39ff14', marginTop: 3 }}>
                    Stored as <code style={{ fontFamily: 'monospace' }}>{nodeType}</code> on the plug document
                    and used by the engine to route execution.
                  </div>
                )}
              </div>

              {/* Hide URL Pattern for SMTP */}
                {authProtocol !== 'smtp_basic' && (
              <div style={css.fg}>
                <label style={css.fl}>URL Pattern *</label>
                <input style={css.fi} value={urlPattern}
                  placeholder= "https://{{hostname}}/ccx/service/{{tenant}}/{{module}}/{{version}}"
                  onChange={e => setUrlPattern(e.target.value)} />
                <div style={{ fontSize: 9, color: '#3a3a50', marginTop: 3 }}>
                  Use {'{{variableName}}'} for values the developer fills at design time.
                </div>
              </div>
                )}
              {/* Variable hints — URL pattern only. Email routing fields (to/cc/bcc/subject/body)
                  are NOT configured here — they are set by developers on the canvas node.
                  Admin only captures SMTP credentials above. */}
              {authProtocol === 'smtp_basic' ? (
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '0.5px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    ✉ Email Plug — Credentials Only
                  </div>
                  <div style={{ fontSize: 9, color: '#9090a0', lineHeight: 1.6 }}>
                    This plug stores your SMTP credentials securely.<br/>
                    Developers configure <strong style={{ color: '#f0f0f4' }}>To / CC / BCC / Subject / Body</strong> when
                    they drag this plug onto the designer canvas — not here.<br/>
                    Body content can be sent inline or as an attachment (with filename and content type).
                  </div>
                </div>
              ) : (
                (() => {
                  const vars = [...(urlPattern.matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]);
                  if (!vars.length) return null;
                  return (
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#16de1d', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                        URL Variable Hints
                      </div>
                      <div style={{ fontSize: 9, color: '#16de1d', marginBottom: 10, lineHeight: 1.5 }}>
                        Describe each variable so developers know what to enter. Optionally set a default.
                      </div>
                      {vars.map(varName => {
                        const existing = variableHints.find(h => h.name === varName)
                          ?? { name: varName, hint: '', defaultValue: '' };
                        const upd = (patch: Partial<PlugVariableHint>) =>
                          setVariableHints(prev => {
                            const idx = prev.findIndex(h => h.name === varName);
                            const u   = { ...existing, ...patch };
                            return idx >= 0 ? prev.map((h, i) => i === idx ? u : h) : [...prev, u];
                          });
                        return (
                          <div key={varName} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: 10, color: '#4f8ef7', fontFamily: 'monospace', marginBottom: 6 }}>
                              {`{{${varName}}}`}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              <input style={css.fi}
                                placeholder={hintPlaceholder(connector?.label ?? '', varName)}
                                value={existing.hint ?? ''}
                                onChange={e => upd({ hint: e.target.value })} />
                              <input style={css.fi}
                                placeholder={defaultPlaceholder(varName)}
                                value={existing.defaultValue ?? ''}
                                onChange={e => upd({ defaultValue: e.target.value })} />
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

          {/* Credentials — always empty on open, filled by admin */}
          {selectedProto && selectedProto.fields.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#16de1d', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
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
                        ? <select style={css.fi} value={credentials[f.name] ?? ''}
                            onChange={e => patchCred(f.name, e.target.value)}>
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
                    {f.helpText && <div style={{ fontSize: 10, color: '#16de1d', marginTop: 2 }}>{f.helpText}</div>}
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
// PlugManager
// ═════════════════════════════════════════════════════════════════════════════
interface Props {
  hubId:          string;
  tenantId:       string;
  userId:         string;
  isAdmin:        boolean;  // boolean from parent — derived from signed token claim
                            // PlugManager never knows what role string means admin
  onPlugCreated?: (plug: PlugSummary) => void; // called after savePlug so Designer
                                               // updates palette immediately
}

const PlugManager: React.FC<Props> = ({ hubId, tenantId, userId, isAdmin, onPlugCreated }) => {
  const [tab,         setTab]         = useState<'plugs' | 'users'>('plugs');
  const [plugs,       setPlugs]       = useState<PlugSummary[]>([]);
  const [users,       setUsers]       = useState<TenantUser[]>([]);
  const [flos,        setFlos]       = useState<FloMeta[]>([]);
  const [connectors,  setConnectors]  = useState<ConnectorDoc[]>([]);
  const [protocols,   setProtocols]   = useState<AuthProtocol[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState('');
  const [plugModal,   setPlugModal]   = useState(false);
  const [editPlug,    setEditPlug]    = useState<PlugSummary | null>(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [editUser,    setEditUser]    = useState<TenantUser | null>(null);

  const {
    fetchAll,
    handleDeactivatePlug,
    handleDeactivateUser,
    handleReactivateUser,
    handleUserInvited,
    handleUserSaved,
    handlePlugSaved: _handlePlugSaved,
  } = usePlugManagerActions({
    hubId, tenantId, isAdmin,
    setPlugs, setUsers, setFlos, setConnectors, setProtocols,
    setLoading, setLoadError,
  });

  // Wrap handlePlugSaved to also notify Designer so the palette updates live.
  const handlePlugSaved = (plug: PlugSummary) => {
    _handlePlugSaved(plug);
    onPlugCreated?.(plug);
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  if (!isAdmin) return null;

  return (
    <>
      <div style={css.panel}>
        {/* Tab header */}
        <div style={css.panelHeader}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f0f0f4' }}>Hub Manager</span>
          <div style={{ display: 'flex', gap: 2, marginLeft: 12 }}>
            {(['plugs', 'users'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '4px 12px', borderRadius: 5, border: 'none',
                background: tab === t ? 'rgba(79,142,247,0.15)' : 'transparent',
                color: tab === t ? '#4f8ef7' : '#6b6b80',
                fontSize: 11, fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ fontSize: 12, color: '#45455a', padding: 20, textAlign: 'center' }}>Loading…</div>
          ) : loadError ? (
            <div style={{ ...css.errBox, margin: 0 }}>{loadError}</div>
          ) : tab === 'plugs' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: '#6b6b80' }}>{plugs.length} plug{plugs.length !== 1 ? 's' : ''}</span>
                <button onClick={() => { setEditPlug(null); setPlugModal(true); }} style={css.btnPrim}>+ New Plug</button>
              </div>

              {plugs.length === 0 && (
                <div style={css.emptyState}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔌</div>
                  <div style={{ fontSize: 13, color: '#6b6b80' }}>No plugs yet</div>
                  <div style={{ fontSize: 11, color: '#45455a', marginTop: 4 }}>Create a plug to configure a connector for this tenant.</div>
                </div>
              )}

              {plugs.map(plug => {
                const proto = protocols.find(p => p.name === plug.authProtocol);
                return (
                  <div key={plug.id} style={css.card(plug.isActive)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔌</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: plug.isActive ? '#d0d0dc' : '#45455a' }}>{plug.name}</span>
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: '#6b6b80' }}>{plug.connectorLabel ?? plug.connectorId}</span>
                          {!plug.isActive && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>INACTIVE</span>}
                        </div>
                        <div style={{ fontSize: 9, color: '#45455a', fontFamily: 'monospace', marginBottom: 3, wordBreak: 'break-all' }}>{plug.urlPattern}</div>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(15,118,110,0.1)', color: '#0f766e', border: '0.5px solid rgba(15,118,110,0.2)' }}>
                          {proto?.label ?? plug.authProtocol}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => { setEditPlug(plug); setPlugModal(true); }} style={css.actionBtn} title="Edit">✎</button>
                        {plug.isActive && (
                          <button onClick={() => handleDeactivatePlug(plug)} style={{ ...css.actionBtn, color: '#f87171' }} title="Deactivate">⏸</button>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 8, color: '#2a2a38', fontFamily: 'monospace' }}>ID: {plug.id}</div>
                  </div>
                );
              })}
            </>
          ) : (
            /* Users tab */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: '#6b6b80' }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setInviteModal(true)} style={css.btnPrim}>+ Invite User</button>
              </div>

              {users.length === 0 && (
                <div style={css.emptyState}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
                  <div style={{ fontSize: 13, color: '#6b6b80' }}>No users yet</div>
                  <div style={{ fontSize: 11, color: '#45455a', marginTop: 4 }}>Invite users to give them access to this hub.</div>
                </div>
              )}

              {users.map(u => {
                const perms      = (u as any).invokePermissions ?? {};
                const allFlosOk = perms.allowedUids?.includes('*');
                const flowCount  = allFlosOk ? null : (perms.allowedUids?.length ?? 0);
                const canRun     = perms.canRunInDesigner ?? false;
                const isHubAdmin = (u as any).isHubAdmin === true;
                const roleLabel  = ROLE_DISPLAY[(u.role as string)] ?? ROLE_DISPLAY['user'];

                return (
                  <div key={u.uid} style={css.card(u.isActive ?? true)}>
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
                          <span style={{ fontSize: 12, fontWeight: 600, color: (u.isActive ?? true) ? '#d0d0dc' : '#45455a' }}>
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
                        <div style={{ fontSize: 9, color: '#45455a', marginBottom: 4 }}>{u.email}</div>
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
                              {allFlosOk ? '🌐 All flos' : flowCount ? `${flowCount} flow${flowCount !== 1 ? 's' : ''}` : '⊘ No flos'}
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

// ── Styles ────────────────────────────────────────────────────────────────────
const css = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' } as React.CSSProperties,
  box:        { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '24px 28px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: "'Inter',-apple-system,sans-serif" } as React.CSSProperties,
  modalHeader:{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 } as React.CSSProperties,
  modalTitle: { fontSize: 14, fontWeight: 600, color: '#f0f0f4' } as React.CSSProperties,
  closeBtn:   { background: 'none', border: 'none', color: '#6b6b80', fontSize: 14, cursor: 'pointer', flexShrink: 0 } as React.CSSProperties,
  errBox:     { background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.2)', borderRadius: 7, padding: '8px 12px', color: '#f87171', fontSize: 12, marginBottom: 14 } as React.CSSProperties,
  successBox: { background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.2)', borderRadius: 7, padding: '8px 12px', color: '#22c55e', fontSize: 12, marginBottom: 14 } as React.CSSProperties,
  fg:         { display: 'flex', flexDirection: 'column', gap: 5 } as React.CSSProperties,
  fl:         { fontSize: 11, fontWeight: 500, color: '#9090a0' } as React.CSSProperties,
  fi:         { padding: '7px 10px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  btnGhost:   { padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#9090a0' } as React.CSSProperties,
  btnPrim:    { padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: '#4f8ef7', color: '#fff' } as React.CSSProperties,
  actionBtn:  { background: 'none', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 5, color: '#6b6b80', fontSize: 12, cursor: 'pointer', padding: '3px 7px' } as React.CSSProperties,
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' } as React.CSSProperties,
  panel:      { display: 'flex', flexDirection: 'column', height: '100%', background: '#141720', fontFamily: "'Inter',-apple-system,sans-serif" } as React.CSSProperties,
  panelHeader:{ height: 46, background: '#181b24', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 } as React.CSSProperties,
  card:       (active: boolean): React.CSSProperties => ({
    background: '#1a1d27',
    border: `0.5px solid ${active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
    borderRadius: 8, padding: '10px 12px', marginBottom: 8, opacity: active ? 1 : 0.6,
  }),
};

export default PlugManager;
