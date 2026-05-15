/**
 * frontend/src/components/modules/UserManagement.tsx
 *
 * Admin Dashboard sub-module: invite and manage users.
 * Two tabs:
 *   "Product users" — FloPlug product admins and developers (FloPlugUsers collection)
 *   "Hub users"     — Customer/developer users within a specific hub + tenant
 *
 * CHANGE: Collection changed from `FloPlugAdminUsers` → `FloPlugUsers`
 */

import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

type FloPlugEnv = 'dev' | 'stage' | 'sb' | 'prod';
type AdminRole  = 'product_admin' | 'developer';
type HubRole    = 'hub_admin' | 'user';

interface AdminUserProfile {
  uid:         string;
  email:       string;
  displayName: string;
  role:        AdminRole;
  allowedEnvs: FloPlugEnv[];
  isActive:    boolean;
}

interface HubUserProfile {
  uid:          string;
  email:        string;
  displayName:  string;
  role:         HubRole;
  workspaceIds: string[];
  isActive:     boolean;
}

interface HubOption    { id: string; name: string; }
interface TenantOption { id: string; name: string; tenantType: string; }

// ── Shared sub-components ─────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
    <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</label>
    {children}
  </div>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input {...props} style={{ width: '100%', padding: '8px 11px', borderRadius: 6, border: '0.5px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', ...props.style }} />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select {...props} style={{ width: '100%', padding: '8px 11px', borderRadius: 6, border: '0.5px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', ...props.style }} />
);

const InviteLink: React.FC<{ link: string }> = ({ link }) => (
  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--green-bg)', border: '0.5px solid rgba(22,163,74,.2)' }}>
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--green)', marginBottom: 6 }}>
      Invite link (copy and send if email is not yet configured)
    </div>
    <div style={{ fontSize: 10, fontFamily: 'var(--font-mono,monospace)', color: 'var(--text-secondary)', wordBreak: 'break-all', background: 'var(--bg-raised)', padding: '6px 8px', borderRadius: 5 }}>
      {link}
    </div>
    <button
      onClick={() => navigator.clipboard.writeText(link)}
      style={{ marginTop: 8, padding: '4px 10px', fontSize: 11, borderRadius: 5, border: '0.5px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      Copy link
    </button>
  </div>
);

const StatusMsg: React.FC<{ msg: string; isError?: boolean }> = ({ msg, isError }) => (
  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: isError ? 'var(--red-bg)' : 'var(--accent-muted)', color: isError ? 'var(--red)' : 'var(--accent-primary)', border: `0.5px solid ${isError ? 'rgba(220,38,38,.2)' : 'var(--accent-border)'}` }}>
    {msg}
  </div>
);

const UserRow: React.FC<{ email: string; name: string; role: string; active: boolean; envs?: string[] }> = ({ email, name, role, active, envs }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '0.5px solid var(--border-subtle)', fontSize: 12 }}>
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)', flexShrink: 0 }}>
      {email.slice(0, 2).toUpperCase()}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || email}</div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
    </div>
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: 'var(--accent-muted)', color: 'var(--accent-primary)', flexShrink: 0 }}>{role}</span>
    {envs && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{envs.join(', ')}</span>}
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, flexShrink: 0, background: active ? 'var(--green-bg)' : 'var(--amber-bg)', color: active ? 'var(--green)' : 'var(--amber)' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  </div>
);

// ── Tab A: Product users ──────────────────────────────────────────────────────

const ProductUserTab: React.FC = () => {
  const [users,      setUsers]      = useState<AdminUserProfile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status,     setStatus]     = useState('');
  const [isError,    setIsError]    = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [form, setForm] = useState({
    email: '', displayName: '', role: 'developer' as AdminRole,
    allowedEnvs: ['dev'] as FloPlugEnv[],
  });

  const ENV_OPTIONS: FloPlugEnv[] = ['dev', 'stage', 'sb', 'prod'];

  useEffect(() => {
    // Read from FloPlugUsers — the unified product user collection
    getDocs(query(collection(db, 'FloPlugUsers'), orderBy('createdAt', 'desc')))
      .then(snap => setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as AdminUserProfile))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleEnv = (env: FloPlugEnv) => {
    setForm(prev => ({
      ...prev,
      allowedEnvs: prev.allowedEnvs.includes(env)
        ? prev.allowedEnvs.filter(e => e !== env)
        : [...prev.allowedEnvs, env],
    }));
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.displayName) return;
    setSubmitting(true); setStatus(''); setInviteLink(''); setIsError(false);
    try {
      const fn = httpsCallable<typeof form, { success: boolean; message: string; inviteLink: string }>(
        getFunctions(), 'inviteAdminUser'
      );
      const { data } = await fn(form);
      setStatus(data.message);
      setInviteLink(data.inviteLink);
      setForm({ email: '', displayName: '', role: 'developer', allowedEnvs: ['dev'] });
    } catch (err: any) {
      setStatus(err?.message ?? 'Invite failed');
      setIsError(true);
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Invite form */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section-header"><h3>Invite product user</h3></div>
        <form onSubmit={handleInvite} style={{ padding: 20 }}>
          <Field label="Email address">
            <Input type="email" required placeholder="alice@floplug.xyz" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </Field>
          <Field label="Full name">
            <Input required placeholder="Alice Smith" value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as AdminRole }))}>
              <option value="product_admin">Product admin — full platform access</option>
              <option value="developer">Developer — build and test, no billing changes</option>
            </Select>
          </Field>
          <Field label="Allowed environments">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {ENV_OPTIONS.map(env => (
                <button key={env} type="button" onClick={() => toggleEnv(env)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px solid var(--border-default)', background: form.allowedEnvs.includes(env) ? 'var(--accent-muted)' : 'var(--bg-input)', color: form.allowedEnvs.includes(env) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                  {env.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>
          <button type="submit" disabled={submitting} className="system-btn" style={{ width: '100%' }}>
            {submitting ? 'Sending invite…' : 'Send invite email'}
          </button>
          {status && <StatusMsg msg={status} isError={isError} />}
          {inviteLink && <InviteLink link={inviteLink} />}
        </form>
      </div>

      {/* User list */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="section-header"><h3>Product users ({users.length})</h3></div>
        {loading
          ? <div style={{ padding: 20, fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</div>
          : users.length === 0
            ? <div style={{ padding: 20, fontSize: 12, color: 'var(--text-tertiary)' }}>No product users yet. Invite one using the form.</div>
            : users.map(u => <UserRow key={u.uid} email={u.email} name={u.displayName} role={u.role} active={u.isActive} envs={u.allowedEnvs} />)
        }
      </div>
    </div>
  );
};

// ── Tab B: Hub users ──────────────────────────────────────────────────────────

const HubUserTab: React.FC = () => {
  const [hubs,           setHubs]           = useState<HubOption[]>([]);
  const [tenants,        setTenants]        = useState<TenantOption[]>([]);
  const [hubUsers,       setHubUsers]       = useState<HubUserProfile[]>([]);
  const [selectedHub,    setSelectedHub]    = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [status,         setStatus]         = useState('');
  const [isError,        setIsError]        = useState(false);
  const [inviteLink,     setInviteLink]     = useState('');
  const [form, setForm] = useState({
    email: '', displayName: '', role: 'user' as HubRole, workspaceIds: [] as string[],
  });

  useEffect(() => {
    getDocs(collection(db, 'FloPlugHubs'))
      .then(snap => setHubs(snap.docs.map(d => ({ id: d.id, name: (d.data().hubName as string) ?? d.id }))))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedHub) { setTenants([]); setSelectedTenant(''); return; }
    getDocs(collection(db, 'FloPlugHubs', selectedHub, 'Tenants'))
      .then(snap => setTenants(snap.docs.map(d => ({ id: d.id, name: (d.data().tenantName as string) ?? d.id, tenantType: (d.data().tenantType as string) ?? '' }))))
      .catch(console.error);
  }, [selectedHub]);

  useEffect(() => {
    if (!selectedHub || !selectedTenant) { setHubUsers([]); return; }
    getDocs(query(collection(db, 'FloPlugHubs', selectedHub, 'Tenants', selectedTenant, 'Users'), orderBy('createdAt', 'desc')))
      .then(snap => setHubUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as HubUserProfile))))
      .catch(console.error);
  }, [selectedHub, selectedTenant]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHub || !selectedTenant) return;
    setSubmitting(true); setStatus(''); setInviteLink(''); setIsError(false);
    try {
      const fn = httpsCallable<
        { email: string; displayName: string; role: HubRole; hubId: string; tenantId: string; workspaceIds: string[] },
        { success: boolean; message: string; inviteLink: string; loginUrl: string }
      >(getFunctions(), 'inviteHubUser');
      const { data } = await fn({ ...form, hubId: selectedHub, tenantId: selectedTenant });
      setStatus(data.message);
      setInviteLink(data.inviteLink);
      setForm({ email: '', displayName: '', role: 'user', workspaceIds: [] });
    } catch (err: any) {
      setStatus(err?.message ?? 'Invite failed');
      setIsError(true);
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hub + tenant selector */}
      <div className="glass-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Select hub">
          <Select value={selectedHub} onChange={e => setSelectedHub(e.target.value)}>
            <option value="">— Choose hub —</option>
            {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </Field>
        <Field label="Select tenant environment">
          <Select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)} disabled={!selectedHub}>
            <option value="">— Choose tenant —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.tenantType})</option>)}
          </Select>
        </Field>
      </div>

      {selectedHub && selectedTenant ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Invite form */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="section-header"><h3>Invite user to this tenant</h3></div>
            <form onSubmit={handleInvite} style={{ padding: 20 }}>
              <Field label="Email address">
                <Input type="email" required placeholder="john@customer.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </Field>
              <Field label="Full name">
                <Input required placeholder="John Doe" value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} />
              </Field>
              <Field label="Hub role">
                <Select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as HubRole }))}>
                  <option value="user">User — own workspaces and flos</option>
                  <option value="hub_admin">Hub admin — manage users and all workspaces</option>
                </Select>
              </Field>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                Workspace assignment can be done after the user first logs in.
              </div>
              <button type="submit" disabled={submitting} className="system-btn" style={{ width: '100%' }}>
                {submitting ? 'Sending invite…' : 'Send invite email'}
              </button>
              {status && <StatusMsg msg={status} isError={isError} />}
              {inviteLink && <InviteLink link={inviteLink} />}
            </form>
          </div>

          {/* Users in this tenant */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="section-header"><h3>Users in this tenant ({hubUsers.length})</h3></div>
            {hubUsers.length === 0
              ? <div style={{ padding: 20, fontSize: 12, color: 'var(--text-tertiary)' }}>No users yet in this tenant</div>
              : hubUsers.map(u => <UserRow key={u.uid} email={u.email} name={u.displayName} role={u.role} active={u.isActive} />)
            }
          </div>
        </div>
      ) : (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, border: '0.5px dashed var(--border-default)', borderRadius: 10 }}>
          Select a hub and tenant environment above to manage users
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

type UserTab = 'product' | 'hub';

const UserManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<UserTab>('product');

  return (
    <div className="glass-card" style={{ padding: 0 }}>
      <div className="section-header"><h3>User management</h3></div>

      <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border-subtle)', padding: '0 20px' }}>
        {([['product', 'Product users'], ['hub', 'Hub users']] as [UserTab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderBottom: activeTab === id ? '1.5px solid var(--accent-primary)' : '1.5px solid transparent', marginBottom: '-0.5px', background: 'transparent', color: activeTab === id ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: activeTab === id ? 500 : 400 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {activeTab === 'product' && <ProductUserTab />}
        {activeTab === 'hub'     && <HubUserTab />}
      </div>
    </div>
  );
};

export default UserManagement;
