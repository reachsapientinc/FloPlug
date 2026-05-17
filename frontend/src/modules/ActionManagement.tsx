/**
 * ActionManagement.tsx
 *
 * Product Admin screen — three sub-tabs per connector:
 *   Schemas   — upload WSDL / XSD / OpenAPI files to Cloud Storage, index in Firestore
 *   Actions   — register operations as actions (auto-from-schema or manual)
 *   Preview   — parse + display fields for a selected action (calls resolveActionSchema)
 *
 * Firestore paths:
 *   FloPlugConnectors/{id}                   → ConnectorDoc  (read-only here)
 *   FloPlugConnectors/{id}/Schemas/{id}      → ConnectorSchema
 *   FloPlugConnectors/{id}/Actions/{id}      → ActionDoc
 *
 * Cloud Storage:
 *   gs://floplug-schemas/{connectorId}/{version}/{filename}
 *
 * Design language matches ConnectorManagement.tsx exactly (same st.* style tokens).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection, doc, getDocs, setDoc,
  serverTimestamp, query, orderBy,
} from 'firebase/firestore';

// Dedicated bucket for schema files (WSDL/XSD/OpenAPI).
// Keeping these in a separate bucket avoids Firestore document size limits
// (1MB per doc) and keeps large binary files out of the database entirely.
// Bucket must be created in Firebase console: gs://floplug-schemas
import type {ConnectorDoc,ActionDoc,ConnectorSchema,ParsedField } from "@floplug/shared";
import { loadConnectors } from '../types/AuthConnectorTypes';
import {COLLECTIONS,HUB_COLLECTIONS,
      SUB_COLLECTIONS,ROLES,
        HTTP_METHODS,
        SCHEMA_TYPES,
        SCHEMA_SOURCE_OPTIONS,
        CATEGORIES } from '@floplug/shared';


type SubTab = 'schemas' | 'actions' | 'preview';

// ── Empty factories ───────────────────────────────────────────────────────────
const emptyAction = (connectorId: string): Omit<ActionDoc, 'id'> => ({
  connectorId,
  label:        '',
  category:     'Human Resources',
  description:  '',
  isActive:     true,
  method:       'POST',
  endpoint:     '',
  soapAction:   '',
  schemaSource: 'wsdl',
  schemaRef:    '',
  operationName:'',
  outputKeys:   [],
  bodyTemplate: '',
  responseMapping: [],
  floKitId: '',
});

// ═════════════════════════════════════════════════════════════════════════════
// ActionManagement
// ═════════════════════════════════════════════════════════════════════════════
const ActionManagement: React.FC = () => {
  const [connectors,   setConnectors]   = useState<ConnectorDoc[]>([]);
  const [selectedConn, setSelectedConn] = useState<string | null>(null);
  const [subTab,       setSubTab]       = useState<SubTab>('schemas');
  const [schemas,      setSchemas]      = useState<ConnectorSchema[]>([]);
  const [actions,      setActions]      = useState<ActionDoc[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [successMsg,   setSuccessMsg]   = useState('');

  const flash = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); }
  };

  // ── Load connectors ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadConnectors().then(list => {
      setConnectors(list);
      setLoading(false);
    }).catch(e => { flash(e.message, true); setLoading(false); });
  }, []);

  // ── Load schemas + actions when connector changes ───────────────────────────
  const loadConnectorData = useCallback(async (connId: string) => {
    setLoading(true);
    try {
      const [schemaSnap, actionSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.SCHEMAS), orderBy('label'))),
        getDocs(query(collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, 'Actions'), orderBy('label'))),
      ]);
      setSchemas(schemaSnap.docs.map(d => ({ id: d.id, ...d.data() } as ConnectorSchema)));
      setActions(actionSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActionDoc)));
    } catch (e: any) { flash(e.message, true); }
    finally { setLoading(false); }
  }, []);

  const handleSelectConnector = (id: string) => {
    setSelectedConn(id);
    setSubTab('schemas');
    loadConnectorData(id);
  };

  const conn = connectors.find(c => c.id === selectedConn) ?? null;

  return (
    <div style={st.root}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <div style={st.title}>Action Management</div>
          <div style={st.subtitle}>
            Upload connector schemas (WSDL / XSD / OpenAPI), then register operations as
            Actions. Developers select Actions in the flow designer — FloPlug handles
            auth, payload building, and response mapping automatically.
          </div>
        </div>
      </div>

      {error      && <div style={st.errorBanner}>{error}</div>}
      {successMsg && <div style={st.successBanner}>{successMsg}</div>}

      <div style={st.body}>
        {/* ── Connector list ────────────────────────────────────────────────── */}
        <div style={st.list}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Connectors
          </div>
          {loading && !selectedConn ? (
            <div style={st.empty}>Loading…</div>
          ) : connectors.length === 0 ? (
            <div style={st.empty}>No connectors found. Register one in Connector Management first.</div>
          ) : connectors.map(c => (
            <div
              key={c.id}
              onClick={() => handleSelectConnector(c.id)}
              style={{ ...st.listItem, ...(selectedConn === c.id ? st.listItemActive : {}) }}
            >
              <div style={st.listTop}>
                <span style={st.listName}>{c.label}</span>
                <span style={{ ...st.chip, ...(c.isActive ? st.chipGreen : st.chipRed) }}>
                  {c.isActive ? 'Active' : 'Off'}
                </span>
              </div>
              <div style={st.listMeta}>{c.id} · {c.category}</div>
            </div>
          ))}
        </div>

        {/* ── Right panel ──────────────────────────────────────────────────── */}
        {selectedConn && conn ? (
          <div style={st.editor}>
            {/* Connector strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f4' }}>{conn.label}</div>
                <div style={{ fontSize: 10, color: '#45455a', fontFamily: 'monospace', marginTop: 2 }}>{conn.id}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#6b6b80' }}>{schemas.length} schema{schemas.length !== 1 ? 's' : ''}</span>
                <span style={{ color: '#2a2a38' }}>·</span>
                <span style={{ fontSize: 10, color: '#6b6b80' }}>{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 18 }}>
              {(['schemas', 'actions', 'preview'] as SubTab[]).map(t => (
                <button key={t} onClick={() => setSubTab(t)} style={{
                  padding: '7px 16px', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: subTab === t ? 600 : 400,
                  background: 'none',
                  color: subTab === t ? '#4f8ef7' : '#6b6b80',
                  borderBottom: `2px solid ${subTab === t ? '#4f8ef7' : 'transparent'}`,
                  textTransform: 'capitalize',
                  transition: 'color 0.12s',
                }}>
                  {t === 'schemas' ? '📄 Schemas' : t === 'actions' ? '⚡ Actions' : '🔍 Preview'}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={st.empty}>Loading…</div>
            ) : subTab === 'schemas' ? (
              <SchemaTab
                connectorId={selectedConn}
                schemas={schemas}
                onSaved={s => { setSchemas(prev => { const i = prev.findIndex(x => x.id === s.id); return i >= 0 ? prev.map(x => x.id === s.id ? s : x) : [...prev, s]; }); flash('Schema saved ✓'); }}
                onError={flash}
              />
            ) : subTab === 'actions' ? (
              <ActionTab
                connectorId={selectedConn}
                schemas={schemas}
                actions={actions}
                onSaved={a => { setActions(prev => { const i = prev.findIndex(x => x.id === a.id); return i >= 0 ? prev.map(x => x.id === a.id ? a : x) : [...prev, a]; }); flash('Action saved ✓'); }}
                onError={flash}
              />
            ) : (
              <PreviewTab
                connectorId={selectedConn}
                actions={actions}
                onError={flash}
              />
            )}
          </div>
        ) : (
          <div style={{ ...st.editor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={st.empty}>Select a connector to manage its schemas and actions.</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SchemaTab — upload + list WSDL/XSD/OpenAPI files
// ═════════════════════════════════════════════════════════════════════════════
interface SchemaTabProps {
  connectorId: string;
  schemas:     ConnectorSchema[];
  onSaved:     (s: ConnectorSchema) => void;
  onError:     (msg: string, isErr?: boolean) => void;
}

const SchemaTab: React.FC<SchemaTabProps> = ({ connectorId, schemas, onSaved, onError }) => {
  const [showForm,    setShowForm]    = useState(false);
  const [file,        setFile]        = useState<File | null>(null);
  const [label,       setLabel]       = useState('');
  const [version,     setVersion]     = useState('');
  const [schemaType,  setSchemaType]  = useState<'wsdl' | 'xsd' | 'openapi'>('wsdl');
  const [uploading,   setUploading]   = useState(false);
  const [parseResult, setParseResult] = useState<string | null>(null);

  

  const handleUpload = async () => {
  if (!file || !label.trim() || !version.trim()) {
    onError("Label, version and file are required", true); return;
  }
  setUploading(true);
  try {
    const fileBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const uploadSchema = httpsCallable(getFunctions(), "uploadSchema");
    const { data: result } = await uploadSchema({
      connectorId,
      version: version.trim(),
      fileName: file.name,
      fileBase64,
      schemaType,
      label: label.trim(),
    }) as any;

    onSaved({ 
      id: result.schemaId, connectorId, label: label.trim(),
      version: version.trim(), schemaType, storagePath: result.storagePath,
      isActive: true, uploadedAt: new Date(), uploadedBy: ROLES.FLOPLUG_ROLES.ADMIN 
    });

    onError("Schema uploaded ✓");   // ← was flash()
    setShowForm(false); setFile(null); setLabel(""); setVersion("");
  } catch (e: any) { onError(e.message, true); }
  finally { setUploading(false); }
};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b6b80' }}>
          {schemas.length} schema file{schemas.length !== 1 ? 's' : ''} registered
        </div>
        <button onClick={() => setShowForm(v => !v)} style={st.primaryBtn}>
          {showForm ? 'Cancel' : '+ Upload Schema'}
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div style={st.section}>
          <div style={st.secTitle}>Upload Schema File</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={st.fg}>
              <label style={st.fl}>Label *</label>
              <input style={st.input} value={label} placeholder="e.g. Human Resources v42.2"
                onChange={e => setLabel(e.target.value)} />
            </div>
            <div style={{ ...st.fg, flex: '0 0 120px' }}>
              <label style={st.fl}>Version *</label>
              <input style={st.input} value={version} placeholder="v42.2"
                onChange={e => setVersion(e.target.value)} />
            </div>
            <div style={{ ...st.fg, flex: '0 0 140px' }}>
              <label style={st.fl}>Schema Type *</label>
              <select style={st.input} value={schemaType}
                onChange={e => setSchemaType(e.target.value as typeof schemaType)}>
                {SCHEMA_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          {/* File drop zone */}
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, padding: '24px',
            border: '1.5px dashed rgba(79,142,247,0.3)', borderRadius: 8,
            background: 'rgba(79,142,247,0.03)', cursor: 'pointer',
            color: '#4f8ef7', fontSize: 13, marginBottom: 12,
          }}>
            <span style={{ fontSize: 28 }}>📄</span>
            <span>{file ? file.name : 'Click to select .wsdl / .xsd / .json / .yaml'}</span>
            {file && <span style={{ fontSize: 10, color: '#6b6b80' }}>{(file.size / 1024).toFixed(1)} KB</span>}
            <input type="file" style={{ display: 'none' }}
              accept=".wsdl,.xsd,.json,.yaml,.yml"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>

          {parseResult && (
            <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 10 }}>✓ {parseResult}</div>
          )}

          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(79,142,247,0.05)', border: '0.5px solid rgba(79,142,247,0.15)', fontSize: 10, color: '#6b6b80', lineHeight: 1.6, marginBottom: 12 }}>
            File is uploaded to <code>gs://floplug-schemas/{connectorId}/{version}/{'{filename}'}</code>.
            After upload, go to the <strong>Actions</strong> tab to register individual operations.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={st.cancelBtn} onClick={() => { setShowForm(false); setFile(null); setParseResult(null); }}>Cancel</button>
            <button style={st.primaryBtn} onClick={handleUpload} disabled={uploading || !file}>
              {uploading ? 'Uploading…' : 'Upload & Register'}
            </button>
          </div>
        </div>
      )}

      {/* Schema list */}
      {schemas.length === 0 ? (
        <div style={st.emptyPanel}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 13, color: '#6b6b80' }}>No schemas uploaded yet</div>
          <div style={{ fontSize: 11, color: '#45455a', marginTop: 4 }}>
            Upload a WSDL, XSD or OpenAPI file to get started.
          </div>
        </div>
      ) : schemas.map(s => (
        <div key={s.id} style={st.card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 22, flexShrink: 0 }}>📄</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#d0d0dc' }}>{s.label}</span>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', border: '0.5px solid rgba(79,142,247,0.2)', fontFamily: 'monospace' }}>
                  {s.schemaType.toUpperCase()}
                </span>
                <span style={{ fontSize: 9, color: '#45455a' }}>v{s.version}</span>
              </div>
              <div style={{ fontSize: 9, color: '#3a3a50', fontFamily: 'monospace' }}>{s.storagePath}</div>
            </div>
            <span style={{ ...st.chip, ...(s.isActive ? st.chipGreen : st.chipRed) }}>
              {s.isActive ? 'Active' : 'Off'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ActionTab — create / edit actions
// ═════════════════════════════════════════════════════════════════════════════
interface ActionTabProps {
  connectorId: string;
  schemas:     ConnectorSchema[];
  actions:     ActionDoc[];
  onSaved:     (a: ActionDoc) => void;
  onError:     (msg: string, isErr?: boolean) => void;
}

const ActionTab: React.FC<ActionTabProps> = ({ connectorId, schemas, actions, onSaved, onError }) => {
  const [selectedAction, setSelectedAction] = useState<ActionDoc | null>(null);
  const [isNew,          setIsNew]          = useState(false);
  const [form,           setForm]           = useState<Omit<ActionDoc, 'id'>>(emptyAction(connectorId));
  const [saving,         setSaving]         = useState(false);
  const [floKits, setFloKits] = useState<{ id: string; name: string }[]>([]);

// Load FloKits for this connector
useEffect(() => {
  getDocs(query(
    collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connectorId, SUB_COLLECTIONS.FLOKITS),
    orderBy('name')
  )).then(snap => {
    setFloKits(snap.docs.map(d => ({ id: d.id, name: (d.data().name as string) ?? d.id })));
  }).catch(console.error);
}, [connectorId]);

  const patch = (p: Partial<ActionDoc>) => setForm(f => ({ ...f, ...p }));

  const handleNew = () => {
    setForm(emptyAction(connectorId));
    setSelectedAction(null);
    setIsNew(true);
  };

  const handleSelect = (a: ActionDoc) => {
    setSelectedAction(a);
    setForm({ ...a });
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!form.label.trim()) { onError('Label is required', true); return; }
    if (!form.endpoint.trim()) { onError('Endpoint is required', true); return; }
    setSaving(true);
    try {
      const ref = selectedAction
        ? doc(db, COLLECTIONS.FLOPLUGCONNECTORS, connectorId, 'Actions', selectedAction.id)
        : doc(collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connectorId, 'Actions'));
      const saved: ActionDoc = { ...form, id: ref.id, connectorId, updatedAt: new Date() };
      await setDoc(ref, { ...saved, updatedAt: serverTimestamp() }, { merge: true });
      onSaved(saved);
      setSelectedAction(saved);
      setIsNew(false);
    } catch (e: any) { onError(e.message, true); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Action list */}
      <div style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button onClick={handleNew} style={{ ...st.primaryBtn, marginBottom: 8 }}>+ New Action</button>
        {actions.length === 0 ? (
          <div style={st.empty}>No actions yet.</div>
        ) : actions.map(a => (
          <div key={a.id} onClick={() => handleSelect(a)}
            style={{ ...st.listItem, ...(selectedAction?.id === a.id && !isNew ? st.listItemActive : {}) }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: a.isActive ? '#f0f0f4' : '#45455a', marginBottom: 2 }}>{a.label}</div>
            <div style={{ fontSize: 9, color: '#45455a' }}>{a.category} · {a.method}</div>
          </div>
        ))}
      </div>

      {/* Action editor */}
      {(isNew || selectedAction) ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Basic info */}
          <div style={st.section}>
            <div style={st.secTitle}>{isNew ? 'New Action' : 'Edit Action'}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={st.fg}>
                <label style={st.fl}>Label *</label>
                <input style={st.input} value={form.label} placeholder="e.g. Create Worker"
                  onChange={e => patch({ label: e.target.value })} />
              </div>
              <div style={{ ...st.fg, flex: '0 0 160px' }}>
                <label style={st.fl}>Category</label>
                <select style={st.input} value={form.category} onChange={e => patch({ category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 0 auto' }}>
                <label style={st.fl}>Active</label>
                <input type="checkbox" checked={form.isActive}
                  onChange={e => patch({ isActive: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: '#4f8ef7', cursor: 'pointer', marginTop: 6 }} />
              </div>
            </div>
            <div style={{ marginTop: 4 }}>
              <label style={st.fl}>Description</label>
              <textarea style={{ ...st.input, minHeight: 40, resize: 'vertical', marginTop: 4 }}
                value={form.description ?? ''} placeholder="What does this action do?"
                onChange={e => patch({ description: e.target.value })} />
            </div>
            {/* FloKit assignment */}
                  <div style={{ marginTop: 10 }}>
                    <label style={st.fl}>FloKit</label>
                    <select style={{ ...st.input, marginTop: 4 }}
                      value={form.floKitId ?? ''}
                      onChange={e => patch({ floKitId: e.target.value })}>
                      <option value="">— No FloKit (standalone action) —</option>
                      {floKits.map(k => (
                        <option key={k.id} value={k.id}>{k.name}</option>
                      ))}
                    </select>
                    {floKits.length === 0 && (
                      <div style={{ fontSize: 10, color: '#45455a', marginTop: 4 }}>
                        No FloKits defined for this connector yet — create one in FloKit Management.
                      </div>
                    )}
                  </div>
          </div>

          {/* HTTP config */}
          <div style={st.section}>
            <div style={st.secTitle}>HTTP Configuration</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ ...st.fg, flex: '0 0 90px' }}>
                <label style={st.fl}>Method *</label>
                <select style={st.input} value={form.method} onChange={e => patch({ method: e.target.value as ActionDoc['method'] })}>
                  {HTTP_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={st.fg}>
                <label style={st.fl}>Endpoint Path *</label>
                <input style={st.input} value={form.endpoint} placeholder="/v1/workers  or  /Human_Resources/v42.2"
                  onChange={e => patch({ endpoint: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={st.fl}>SOAP Action (leave blank for REST)</label>
              <input style={{ ...st.input, marginTop: 4 }} value={form.soapAction ?? ''}
                placeholder="urn:com.workday/bsvc/Put_Worker"
                onChange={e => patch({ soapAction: e.target.value })} />
            </div>
          </div>

          {/* Schema source */}
          <div style={st.section}>
            <div style={st.secTitle}>Schema Source</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              {SCHEMA_SOURCE_OPTIONS.map(o => (
                <button key={o.value} onClick={() => patch({ schemaSource: o.value as ActionDoc['schemaSource'] })}
                  style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: `1.5px solid ${form.schemaSource === o.value ? '#4f8ef7' : 'rgba(255,255,255,0.08)'}`,
                    background: form.schemaSource === o.value ? 'rgba(79,142,247,0.1)' : 'rgba(255,255,255,0.03)',
                    color: form.schemaSource === o.value ? '#4f8ef7' : '#6b6b80',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>

            {form.schemaSource !== 'manual' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={st.fg}>
                  <label style={st.fl}>Schema File *</label>
                  <select style={st.input} value={form.schemaRef ?? ''}
                    onChange={e => patch({ schemaRef: e.target.value })}>
                    <option value="">— Select a schema —</option>
                    {schemas.filter(s => s.schemaType === form.schemaSource).map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  {schemas.filter(s => s.schemaType === form.schemaSource).length === 0 && (
                    <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>
                      No {form.schemaSource?.toUpperCase()} schemas uploaded yet. Upload one in the Schemas tab.
                    </div>
                  )}
                </div>
                <div style={st.fg}>
                  <label style={st.fl}>Operation Name *</label>
                  <input style={st.input} value={form.operationName ?? ''}
                    placeholder="Put_Worker  or  createEmployee"
                    onChange={e => patch({ operationName: e.target.value })} />
                </div>
              </div>
            )}

            {form.schemaSource === 'manual' && (
              <div style={{ fontSize: 11, color: '#6b6b80', lineHeight: 1.6 }}>
                Fields will be defined manually. Use the Response Mapping section below
                to declare what this action returns into cStream. The field preview in the
                designer will show those output keys.
              </div>
            )}
          </div>

          {/* Response mapping */}
          <div style={st.section}>
            <div style={st.secTitle}>
              Output Keys written into cStream
              <span style={{ fontSize: 9, color: '#45455a', fontFamily: 'monospace', marginLeft: 8 }}>
                comma-separated
              </span>
            </div>
            <input style={st.input}
              value={(form.outputKeys ?? []).join(', ')}
              placeholder="workerId, _actionStatus, _rawResponse"
              onChange={e => patch({ outputKeys: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            <div style={{ fontSize: 9, color: '#3a3a50', marginTop: 6, lineHeight: 1.5 }}>
              Developers see these in the node to know what cStream fields are available downstream.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={st.cancelBtn} onClick={() => { setIsNew(false); setSelectedAction(null); }}>Cancel</button>
            <button style={st.primaryBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create Action' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={st.empty}>Select an action to edit, or create a new one.</div>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// PreviewTab — parse and show fields for a selected action
// ═════════════════════════════════════════════════════════════════════════════
interface PreviewTabProps {
  connectorId: string;
  actions:     ActionDoc[];
  onError:     (msg: string, isErr?: boolean) => void;
}

const PreviewTab: React.FC<PreviewTabProps> = ({ connectorId, actions, onError }) => {
  const [selectedId, setSelectedId] = useState('');
  const [fields,     setFields]     = useState<ParsedField[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [fromCache,  setFromCache]  = useState(false);
  const [filter,     setFilter]     = useState('');

  const handlePreview = async () => {
    if (!selectedId) return;
    setLoading(true); setFields([]);
    try {
      const fn = httpsCallable(getFunctions(), 'resolveActionSchema');
      const { data } = await fn({ connectorId, actionId: selectedId }) as any;
      setFields(data.fields ?? []);
      setFromCache(data.fromCache ?? false);
    } catch (e: any) { onError(e.message, true); }
    finally { setLoading(false); }
  };

  const filtered = fields.filter(f =>
    !filter || f.path.toLowerCase().includes(filter.toLowerCase()) ||
    f.label.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Action selector */}
      <div style={st.section}>
        <div style={st.secTitle}>Select Action to Preview</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={st.fg}>
            <label style={st.fl}>Action</label>
            <select style={st.input} value={selectedId} onChange={e => { setSelectedId(e.target.value); setFields([]); }}>
              <option value="">— Select an action —</option>
              {actions.map(a => (
                <option key={a.id} value={a.id}>{a.category} → {a.label}</option>
              ))}
            </select>
          </div>
          <button onClick={handlePreview} disabled={!selectedId || loading} style={{ ...st.primaryBtn, whiteSpace: 'nowrap' }}>
            {loading ? 'Parsing…' : '🔍 Parse Schema'}
          </button>
        </div>
      </div>

      {/* Results */}
      {fields.length > 0 && (
        <div style={st.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={st.secTitle}>
              {fields.length} fields parsed
              {fromCache && <span style={{ fontSize: 9, color: '#45455a', marginLeft: 6 }}>(from cache)</span>}
            </div>
            <input style={{ ...st.input, maxWidth: 220 }} value={filter} placeholder="Filter fields…"
              onChange={e => setFilter(e.target.value)} />
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 50px 50px', gap: 8, padding: '6px 8px', fontSize: 9, color: '#45455a', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
            <div>Path</div><div>Type</div><div>XSD Type</div><div>Req</div><div>Multi</div>
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filtered.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 50px 50px', gap: 8, padding: '5px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.03)', fontSize: 10, alignItems: 'center' }}>
                <div style={{ fontFamily: 'monospace', color: '#c0c0cc', fontSize: 9, wordBreak: 'break-all' }}>{f.path}</div>
                <div style={{ color: '#f0f0f4' }}>{f.label}</div>
                <div style={{ color: '#45455a', fontFamily: 'monospace', fontSize: 9 }}>{f.xsdType.split(':').pop()}</div>
                <div style={{ textAlign: 'center' }}>
                  {f.required ? <span style={{ color: '#f87171' }}>✓</span> : <span style={{ color: '#3a3a50' }}>—</span>}
                </div>
                <div style={{ textAlign: 'center' }}>
                  {f.repeating ? <span style={{ color: '#4f8ef7' }}>[]</span> : <span style={{ color: '#3a3a50' }}>—</span>}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && filter && (
            <div style={{ ...st.empty, textAlign: 'center', padding: 20 }}>No fields match "{filter}"</div>
          )}
        </div>
      )}

      {fields.length === 0 && !loading && selectedId && (
        <div style={st.emptyPanel}>
          <div style={{ fontSize: 11, color: '#6b6b80' }}>Click "Parse Schema" to load fields from the WSDL/XSD.</div>
        </div>
      )}
    </div>
  );
};

// ── Styles (same design tokens as ConnectorManagement / AuthManagement) ────────
const st: Record<string, React.CSSProperties> = {
  root:         { padding: '28px 32px', color: '#f0f0f4', fontFamily: "'Inter',-apple-system,sans-serif", maxWidth: 1200 },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title:        { fontSize: 20, fontWeight: 700, color: '#f0f0f4', marginBottom: 4 },
  subtitle:     { fontSize: 12, color: '#6b6b80', maxWidth: 660, lineHeight: 1.6 },
  body:         { display: 'flex', gap: 20, alignItems: 'flex-start' },
  list:         { flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 5 },
  listItem:     { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' },
  listItemActive:{ background: '#1e2130', borderColor: '#4f8ef7' },
  listTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  listName:     { fontSize: 13, fontWeight: 600, color: '#f0f0f4' },
  listMeta:     { fontSize: 10, color: '#45455a' },
  chip:         { fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, border: '0.5px solid transparent' },
  chipGreen:    { background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' },
  chipRed:      { background: 'rgba(239,68,68,0.1)',  color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' },
  empty:        { fontSize: 12, color: '#45455a', lineHeight: 1.6 },
  emptyPanel:   { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', textAlign: 'center' },
  editor:       { flex: 1, background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 },
  section:      { background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px 16px', marginBottom: 2 },
  secTitle:     { fontSize: 10, fontWeight: 700, color: '#9090a0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 },
  fg:           { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 160 },
  fl:           { fontSize: 10, fontWeight: 500, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.4px' },
  input:        { padding: '7px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  card:         { background: '#1a1d27', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', marginBottom: 6 },
  primaryBtn:   { padding: '8px 18px', borderRadius: 7, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn:    { padding: '8px 18px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b6b80', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  errorBanner:  { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.25)', color: '#f87171', fontSize: 12 },
  successBanner:{ padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.25)', color: '#22c55e', fontSize: 12 },
};

export default ActionManagement;
