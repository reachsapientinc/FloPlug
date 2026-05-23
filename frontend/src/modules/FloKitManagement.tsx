/**
 * FloKitManagement.tsx
 *
 * Two-step workflow:
 *   1. Kit details — create / edit identity (name, id, version, tiers)
 *   2. Schema & actions — associate schema and select actions for the kit
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebaseConfig';
import {
  collection, doc, getDocs, setDoc,
  serverTimestamp, query, orderBy, writeBatch,
} from 'firebase/firestore';
import type {
  ConnectorDoc, FloKitDoc, ConnectorSchema, ActionDoc,
  SchemaOperationRef,
} from '@floplug/shared';
import {
  validateFloKitIdentity, validateFloKitConfiguration,
  isFloKitConfigured, resolveKitServicesSchemaId,
} from '@floplug/shared';
import { loadConnectors } from '../types/AuthConnectorTypes';
import { COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import { fetchSchemaOperations } from '../lib/schemaOperations';

type EditorTab = 'details' | 'configure';

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const emptyKit = (connectorId: string): FloKitDoc => ({
  id: '', name: '', description: '',
  connectorId,
  servicesSchemaId: '', servicesSchemaVersion: '',
  dataModelSchemaId: '', dataModelSchemaVersion: '',
  actionIds: [],
  kitVersion: '1.0.0',
  availableForTiers: [],
  isActive: true,
});

function operationDocId(operationName: string): string {
  return slugify(operationName);
}

function kitNeedsConfiguration(kit: FloKitDoc): boolean {
  return !isFloKitConfigured(kit);
}

function hydrateKitFromFirestore(kit: FloKitDoc, connectorId: string): FloKitDoc {
  const servicesSchemaId = resolveKitServicesSchemaId(kit);
  return {
    ...emptyKit(connectorId),
    ...kit,
    connectorId,
    servicesSchemaId,
    servicesSchemaVersion:
      kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',
    dataModelSchemaId: kit.dataModelSchemaId ?? '',
    dataModelSchemaVersion: kit.dataModelSchemaVersion ?? '',
    actionIds: kit.actionIds ?? [],
    kitVersion: kit.kitVersion ?? '1.0.0',
  };
}

function floKitActionsPath(connId: string, kitId: string) {
  return [
    COLLECTIONS.FLOPLUGCONNECTORS, connId,
    SUB_COLLECTIONS.FLOKITS, kitId,
    SUB_COLLECTIONS.FLOKITACTIONS,
  ] as const;
}

const FloKitManagement: React.FC = () => {
  const [connectors,     setConnectors]     = useState<ConnectorDoc[]>([]);
  const [selectedConn,   setSelectedConn]   = useState<string | null>(null);
  const [floKits,        setFloKits]        = useState<FloKitDoc[]>([]);
  const [schemas,        setSchemas]        = useState<ConnectorSchema[]>([]);
  const [actions,        setActions]        = useState<ActionDoc[]>([]);
  const [selectedKit,    setSelectedKit]    = useState<FloKitDoc | null>(null);
  const [form,           setForm]           = useState<FloKitDoc>(emptyKit(''));
  const [isNew,          setIsNew]          = useState(false);
  const [editorTab,      setEditorTab]      = useState<EditorTab>('details');
  const [kitPersisted,   setKitPersisted]   = useState(false);
  const [availableTiers, setAvailableTiers] = useState<{ id: string; tierName: string }[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [dataLoading,    setDataLoading]    = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');
  const [actionFilter,       setActionFilter]       = useState('');
  const [schemaOps,          setSchemaOps]          = useState<SchemaOperationRef[]>([]);
  const [selectedOperations, setSelectedOperations] = useState<string[]>([]);
  const [loadingSchemaOps,   setLoadingSchemaOps]   = useState(false);

  const flash = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 6000); }
    else { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 4000); }
  };

  const patch = (p: Partial<FloKitDoc>) => setForm(f => ({ ...f, ...p }));

  const kitSaved = kitPersisted || (!!selectedKit && !isNew);

  useEffect(() => {
    const init = async () => {
      try {
        const [conns, tierSnap] = await Promise.all([
          loadConnectors(),
          getDocs(collection(db, COLLECTIONS.FLOPLUGTIERS)),
        ]);
        setConnectors(conns.filter(c => c.allowActionNodes));
        setAvailableTiers(tierSnap.docs.map(d => ({
          id:       d.id,
          tierName: (d.data().tierName as string) ?? d.id,
        })));
      } catch (e: unknown) { flash(e instanceof Error ? e.message : String(e), true); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  const loadConnectorCatalog = useCallback(async (connId: string) => {
    setDataLoading(true);
    try {
      const [schemaSnap, kitSnap] = await Promise.all([
        getDocs(query(
          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.SCHEMAS),
          orderBy('label'),
        )),
        getDocs(query(
          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.FLOKITS),
          orderBy('name'),
        )),
      ]);
      setSchemas(schemaSnap.docs.map(d => ({ id: d.id, ...d.data() } as ConnectorSchema)));
      setActions([]);
      setFloKits(kitSnap.docs.map(d => ({ id: d.id, ...d.data() } as FloKitDoc)));
    } catch (e: unknown) { flash(e instanceof Error ? e.message : String(e), true); }
    finally { setDataLoading(false); }
  }, []);

  const handleSelectConnector = (connId: string) => {
    setSelectedConn(connId);
    setSelectedKit(null);
    setIsNew(false);
    setKitPersisted(false);
    setEditorTab('details');
    setForm(emptyKit(connId));
    setActionFilter('');
    loadConnectorCatalog(connId);
  };

  const loadKitActions = useCallback(async (connId: string, kitId: string) => {
    if (!kitId) { setActions([]); return; }
    try {
      const snap = await getDocs(
        query(collection(db, ...floKitActionsPath(connId, kitId)), orderBy('label')),
      );
      setActions(snap.docs.map(d => ({ id: d.id, ...d.data(), floKitId: kitId } as ActionDoc)));
    } catch {
      setActions([]);
    }
  }, []);

  const applyKitToForm = (kit: FloKitDoc) => {
    const connId = kit.connectorId || selectedConn || '';
    setForm(hydrateKitFromFirestore(kit, connId));
    setKitPersisted(true);
    setEditorTab(kitNeedsConfiguration(kit) ? 'configure' : 'details');
    if (connId && kit.id) void loadKitActions(connId, kit.id);
  };

  const handleSelectKit = (kit: FloKitDoc) => {
    setSelectedKit(kit);
    setIsNew(false);
    applyKitToForm(kit);
    setActionFilter('');
    setError('');
    setSuccessMsg('');
  };

  const handleNew = () => {
    if (!selectedConn) return;
    setSelectedKit(null);
    setForm(emptyKit(selectedConn));
    setIsNew(true);
    setKitPersisted(false);
    setEditorTab('details');
    setActionFilter('');
    setError('');
    setSuccessMsg('');
  };

  const handleNameChange = (name: string) => {
    patch({ name, ...(isNew ? { id: slugify(name) } : {}) });
  };

  const serviceSchemas = useMemo(
    () => schemas.filter(s =>
      s.isActive !== false &&
      (s.schemaType === 'wsdl' || s.schemaType === 'openapi' || s.schemaType === 'graphql'),
    ),
    [schemas],
  );
  const dataModelSchemas = useMemo(
    () => schemas.filter(s => s.isActive !== false && s.schemaType === 'xsd'),
    [schemas],
  );
  const selectedServicesSchema = useMemo(
    () => schemas.find(s => s.id === form.servicesSchemaId),
    [schemas, form.servicesSchemaId],
  );
  const selectedDataModelSchema = useMemo(
    () => schemas.find(s => s.id === form.dataModelSchemaId),
    [schemas, form.dataModelSchemaId],
  );

  const filteredSchemaOps = useMemo(() => {
    if (!actionFilter.trim()) return schemaOps;
    const q = actionFilter.toLowerCase();
    return schemaOps.filter(o =>
      o.name.toLowerCase().includes(q) ||
      o.label.toLowerCase().includes(q) ||
      (o.method ?? '').toLowerCase().includes(q) ||
      (o.endpoint ?? '').toLowerCase().includes(q),
    );
  }, [schemaOps, actionFilter]);

  const loadSchemaOperations = useCallback(async (schemaId: string, refresh = false) => {
    if (!selectedConn || !schemaId) {
      setSchemaOps([]);
      return;
    }
    setLoadingSchemaOps(true);
    try {
      const schema = schemas.find(s => s.id === schemaId);
      let ops: SchemaOperationRef[] = [];

      if (!refresh && schema?.operationsMeta?.length) {
        ops = schema.operationsMeta;
      } else if (!refresh && schema?.operations?.length) {
        ops = schema.operations.map(name => ({ name, label: name }));
      } else {
        const result = await fetchSchemaOperations(selectedConn, schemaId, refresh);
        ops = result.operations;
        setSchemas(prev => prev.map(s =>
          s.id === schemaId
            ? { ...s, operations: ops.map(o => o.name), operationsMeta: ops }
            : s,
        ));
      }

      setSchemaOps(ops);

      const allowed = new Set(ops.map(o => o.name));
      setSelectedOperations(prev => {
        if (prev.length > 0) return prev.filter(n => allowed.has(n));
        const fromKit = (form.actionIds ?? [])
          .map(id => {
            const byOp = ops.find(o => operationDocId(o.name) === id);
            if (byOp) return byOp.name;
            const action = actions.find(a => a.id === id);
            return action?.operationName ?? action?.label;
          })
          .filter((n): n is string => !!n && allowed.has(n));
        return fromKit;
      });
    } catch (e: unknown) {
      setSchemaOps([]);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setTimeout(() => setError(''), 6000);
    } finally {
      setLoadingSchemaOps(false);
    }
  }, [selectedConn, schemas, form.actionIds, actions, form.name]);

  useEffect(() => {
    if (editorTab === 'configure' && form.servicesSchemaId && kitSaved) {
      loadSchemaOperations(form.servicesSchemaId);
    }
  }, [editorTab, form.servicesSchemaId, kitSaved, loadSchemaOperations]);

  const handleServicesSchemaChange = (schemaId: string) => {
    const schema = schemas.find(s => s.id === schemaId);
    patch({
      servicesSchemaId: schemaId,
      servicesSchemaVersion: schema?.version ?? '',
      actionIds: [],
    });
    setSelectedOperations([]);
    if (schemaId) loadSchemaOperations(schemaId);
    else setSchemaOps([]);
  };

  const handleDataModelSchemaChange = (schemaId: string) => {
    const schema = schemas.find(s => s.id === schemaId);
    patch({
      dataModelSchemaId: schemaId,
      dataModelSchemaVersion: schema?.version ?? '',
    });
  };

  const toggleOperation = (operationName: string) => {
    setSelectedOperations(prev =>
      prev.includes(operationName)
        ? prev.filter(n => n !== operationName)
        : [...prev, operationName],
    );
  };

  const selectAllVisible = () => {
    const names = new Set(selectedOperations);
    filteredSchemaOps.forEach(o => names.add(o.name));
    setSelectedOperations([...names]);
  };

  const clearOperations = () => setSelectedOperations([]);

  /** Firestore rejects `undefined` anywhere in a document — omit those keys. */
  function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    );
  }

  const upsertActionsForOperations = async (
    ops: SchemaOperationRef[],
    selectedNames: string[],
  ): Promise<ActionDoc[]> => {
    if (!selectedConn || !selectedServicesSchema || !form.id) return [];
    const schemaSource = selectedServicesSchema.schemaType === 'openapi'
      ? 'openapi'
      : selectedServicesSchema.schemaType === 'graphql'
        ? 'graphql'
        : 'wsdl';

    const actionsCol = collection(db, ...floKitActionsPath(selectedConn, form.id));
    const existingSnap = await getDocs(actionsCol);
    const keepIds = new Set(selectedNames.map(operationDocId));
    const batch = writeBatch(db);
    for (const d of existingSnap.docs) {
      if (!keepIds.has(d.id)) batch.delete(d.ref);
    }

    const saved: ActionDoc[] = [];
    for (const name of selectedNames) {
      const op = ops.find(o => o.name === name);
      if (!op) continue;
      const opAny = op as SchemaOperationRef & {
        inputMessageName?: string;
        requestRootElement?: string;
        requestTypeName?: string;
      };
      const id = operationDocId(name);
      const requestBinding = omitUndefined({
        inputMessageName:     opAny.inputMessageName,
        requestRootElement:   opAny.requestRootElement,
        requestTypeName:      opAny.requestTypeName,
        resolvedAt:           new Date(),
        servicesSchemaId:     form.servicesSchemaId || undefined,
        servicesSchemaVersion:
          selectedServicesSchema?.version ?? form.servicesSchemaVersion ?? undefined,
      });
      const isWsdl = schemaSource === 'wsdl';
      const action: ActionDoc & {
        requestBinding?: Record<string, unknown>;
      } = {
        id,
        connectorId: selectedConn,
        label:       op.label,
        category:    'Custom',
        description: `FloKit ${form.name} — ${name}`,
        isActive:    true,
        method:      (op.method ?? 'POST') as ActionDoc['method'],
        endpoint:    op.endpoint ?? '/',
        schemaSource,
        schemaRef:   form.servicesSchemaId,
        operationName: name,
        floKitId:    form.id,
        ...(isWsdl ? {
          contentType: 'text/xml',
          soapAction:  `urn:com.workday/bsvc/${name}`,
        } : schemaSource === 'openapi' || schemaSource === 'graphql' ? {
          contentType: 'application/json',
        } : {}),
        ...(Object.keys(requestBinding).length > 0 ? { requestBinding } : {}),
      };
      batch.set(doc(actionsCol, id), { ...action, updatedAt: serverTimestamp() }, { merge: true });
      saved.push(action);
    }
    await batch.commit();
    setActions(saved.sort((a, b) => a.label.localeCompare(b.label)));
    return saved;
  };

  // NOTE:
  // We intentionally do NOT sync kit-scoped `ActionNodes` from this screen.
  // Source of truth for saved operations is:
  //   FloPlugConnectors/{connectorId}/FloKits/{kitId}/FloKitActions/{actionId}
  // Hub-visible node registry uses tenant-scoped `FloActionNodes`.

  const persistKit = async (payload: FloKitDoc, creating: boolean) => {
    if (!selectedConn) throw new Error('Select a connector first');
    const ref = doc(db, COLLECTIONS.FLOPLUGCONNECTORS, selectedConn, SUB_COLLECTIONS.FLOKITS, payload.id);
    await setDoc(ref, {
      ...payload,
      connectorId: selectedConn,
      updatedAt:   serverTimestamp(),
      ...(creating ? { createdAt: serverTimestamp() } : {}),
    }, { merge: true });
    const saved = { ...payload, id: payload.id };
    setFloKits(prev => {
      const idx = prev.findIndex(k => k.id === payload.id);
      return idx >= 0
        ? prev.map(k => k.id === payload.id ? saved : k)
        : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelectedKit(saved);
    setIsNew(false);
    setKitPersisted(true);
    setForm(saved);
    return saved;
  };

  const handleSaveDetails = async () => {
    if (!selectedConn) { flash('Select a connector first', true); return; }

    const err = validateFloKitIdentity(form);
    if (err) { flash(err, true); return; }

    if (isNew && floKits.find(k => k.id === form.id)) {
      flash(`FloKit ID '${form.id}' already exists for this connector`, true);
      return;
    }

    setSaving(true);
    try {
      await persistKit({ ...form, connectorId: selectedConn }, isNew);
      flash(`FloKit '${form.name}' saved. Configure schema and actions next →`);
      setEditorTab('configure');
    } catch (e: unknown) { flash(e instanceof Error ? e.message : String(e), true); }
    finally { setSaving(false); }
  };

  const handleSaveConfiguration = async () => {
    if (!kitSaved) {
      flash('Save kit details first (Step 1).', true);
      setEditorTab('details');
      return;
    }
    if (!selectedConn) { flash('Select a connector first', true); return; }

    const allowedNames = schemaOps.map(o => o.name);
    const validationError = validateFloKitConfiguration(
      selectedOperations,
      allowedNames,
      form.servicesSchemaId,
      form.dataModelSchemaId,
    );
    if (validationError) { flash(validationError, true); return; }

    const actionIds = selectedOperations.map(operationDocId);
    const servicesVer = selectedServicesSchema?.version ?? form.servicesSchemaVersion;
    const payload: FloKitDoc = {
      ...form,
      connectorId:   selectedConn,
      servicesSchemaVersion: servicesVer,
      dataModelSchemaVersion: selectedDataModelSchema?.version ?? form.dataModelSchemaVersion,
      wsdlSchemaId:      form.servicesSchemaId,
      wsdlSchemaVersion: servicesVer,
      schemaId:          form.servicesSchemaId,
      schemaVersion:     servicesVer,
      actionIds,
    };

    setSaving(true);
    try {
      await upsertActionsForOperations(schemaOps, selectedOperations);
      await persistKit(payload, false);
      // ActionNodes sync disabled by design; keep save focused on FloKit + FloKitActions.
      flash(`Schema and ${selectedOperations.length} operation(s) saved for '${form.name}' ✓`);
    } catch (e: unknown) { flash(e instanceof Error ? e.message : String(e), true); }
    finally { setSaving(false); }
  };

  const conn = connectors.find(c => c.id === selectedConn);
  const showEditor = (isNew || selectedKit) && selectedConn;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.title}>FloKit Management</div>
          <div style={s.subtitle}>
            <strong>Step 1:</strong> Create the kit (name &amp; id).
            <strong> Step 2:</strong> Pick <em>services schema</em> + <em>data model schema</em>, then select operations (stored under this FloKit).
          </div>
        </div>
      </div>

      {error      && <div style={s.errBanner}>{error}</div>}
      {successMsg && <div style={s.okBanner}>{successMsg}</div>}

      <div style={s.body}>

        <div style={s.connList}>
          <div style={s.colHeader}>Connectors</div>
          {loading && !selectedConn ? (
            <div style={s.empty}>Loading…</div>
          ) : connectors.length === 0 ? (
            <div style={s.empty}>
              No connectors eligible for PreDefined Nodes.
              Enable the flag in Connector Management first.
            </div>
          ) : connectors.map(c => (
            <div key={c.id} onClick={() => handleSelectConnector(c.id)}
              style={{ ...s.listItem, ...(selectedConn === c.id ? s.listOn : {}) }}>
              <div style={s.listName}>{c.label}</div>
              <div style={s.listMeta}>{c.category}</div>
            </div>
          ))}
        </div>

        {selectedConn && (
          <div style={s.kitList}>
            <div style={{ ...s.colHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>FloKits — {conn?.label}</span>
              <button type="button" onClick={handleNew} style={s.addBtn}>+ New</button>
            </div>
            {dataLoading ? (
              <div style={s.empty}>Loading…</div>
            ) : floKits.length === 0 ? (
              <div style={s.empty}>No FloKits yet — create one.</div>
            ) : floKits.map(k => {
              const needsSetup = kitNeedsConfiguration(k);
              return (
                <div key={k.id} onClick={() => handleSelectKit(k)}
                  style={{ ...s.listItem, ...(selectedKit?.id === k.id && !isNew ? s.listOn : {}) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span style={s.listName}>{k.name}</span>
                    {needsSetup ? (
                      <span style={s.chipAmber}>Setup</span>
                    ) : (
                      <span style={{ ...s.chip, ...(k.isActive ? s.chipGreen : s.chipRed) }}>
                        {k.isActive ? 'Active' : 'Off'}
                      </span>
                    )}
                  </div>
                  <div style={s.listMeta}>{k.id} · v{k.kitVersion ?? '1.0.0'}</div>
                  {!needsSetup && (k.actionIds?.length ?? 0) > 0 && (
                    <div style={{ ...s.listMeta, marginTop: 2 }}>
                      {k.actionIds!.length} action{k.actionIds!.length !== 1 ? 's' : ''}
                      {k.schemaVersion ? ` · ${k.schemaVersion}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showEditor ? (
          <div style={s.editor}>
            <div style={s.tabBar}>
              <button
                type="button"
                style={{ ...s.tab, ...(editorTab === 'details' ? s.tabOn : {}) }}
                onClick={() => setEditorTab('details')}
              >
                1. Kit details
              </button>
              <button
                type="button"
                style={{
                  ...s.tab,
                  ...(editorTab === 'configure' ? s.tabOn : {}),
                  ...(!kitSaved ? s.tabDisabled : {}),
                }}
                disabled={!kitSaved}
                onClick={() => kitSaved && setEditorTab('configure')}
                title={kitSaved ? 'Associate schema and actions' : 'Save kit details first'}
              >
                2. Schema &amp; actions
                {selectedOperations.length > 0 && (
                  <span style={s.tabBadge}>{selectedOperations.length}</span>
                )}
              </button>
            </div>

            {!kitSaved && editorTab === 'configure' && (
              <div style={s.warnBanner}>
                Save kit details in Step 1 before configuring schema and actions.
              </div>
            )}

            {editorTab === 'details' && (
              <>
                <div style={s.section}>
                  <div style={s.secTitle}>{isNew ? 'New FloKit' : `Kit: ${form.name}`}</div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={s.fl}>Display Name *</label>
                    <input style={s.input} value={form.name}
                      placeholder="e.g. Workday Human Resources"
                      onChange={e => handleNameChange(e.target.value)} />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={s.fl}>
                      FloKit ID *
                      {isNew && <span style={{ color: '#45455a', marginLeft: 6, fontSize: 10 }}>
                        auto-generated · immutable after create
                      </span>}
                    </label>
                    <input
                      style={{ ...s.input, ...(isNew ? {} : s.inputDim) }}
                      value={form.id}
                      disabled={!isNew}
                      placeholder="workday_hr"
                      onChange={e => isNew && patch({ id: slugify(e.target.value) })}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={s.fl}>Kit Version *</label>
                    <input style={s.input} value={form.kitVersion}
                      placeholder="1.0.0"
                      onChange={e => patch({ kitVersion: e.target.value.trim() })} />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={s.fl}>Description</label>
                    <textarea style={{ ...s.input, minHeight: 52, resize: 'vertical' as const }}
                      value={form.description}
                      placeholder="Business domain this kit covers"
                      onChange={e => patch({ description: e.target.value })} />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.isActive}
                      onChange={e => patch({ isActive: e.target.checked })}
                      style={{ width: 14, height: 14, accentColor: '#4f8ef7', cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, color: '#9090a0' }}>Active</span>
                  </label>
                </div>

                <div style={s.section}>
                  <div style={s.secTitle}>Available for Tiers</div>
                  <div style={{ fontSize: 11, color: '#45455a', marginBottom: 10 }}>
                    Which hub tiers can access this FloKit. Leave empty for all tiers.
                  </div>
                  {availableTiers.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#45455a', fontStyle: 'italic' }}>
                      No tiers found — create tiers in Tier Management first.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      {availableTiers.map(t => {
                        const sel = form.availableForTiers.includes(t.id);
                        return (
                          <button key={t.id} type="button"
                            onClick={() => patch({
                              availableForTiers: sel
                                ? form.availableForTiers.filter(id => id !== t.id)
                                : [...form.availableForTiers, t.id],
                            })}
                            style={{
                              padding: '5px 14px', borderRadius: 20, fontSize: 11,
                              cursor: 'pointer', fontFamily: 'inherit',
                              border: `0.5px solid ${sel ? 'rgba(79,142,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
                              background: sel ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.03)',
                              color: sel ? '#4f8ef7' : '#6b6b80',
                            }}>
                            {sel ? '✓ ' : ''}{t.tierName}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={s.footerRow}>
                  <button type="button" style={s.cancelBtn}
                    onClick={() => { setIsNew(false); setSelectedKit(null); setKitPersisted(false); setForm(emptyKit(selectedConn)); setEditorTab('details'); }}>
                    Cancel
                  </button>
                  <button type="button" style={s.primaryBtn} onClick={handleSaveDetails} disabled={saving || dataLoading}>
                    {saving ? 'Saving…' : isNew ? 'Create FloKit' : 'Save details'}
                  </button>
                  {kitSaved && (
                    <button type="button" style={s.secondaryBtn} onClick={() => setEditorTab('configure')}>
                      Next: Schema &amp; actions →
                    </button>
                  )}
                </div>
              </>
            )}

            {editorTab === 'configure' && kitSaved && (
              <>
                <div style={s.section}>
                  <div style={s.secTitle}>1. Services schema *</div>
                  <div style={{ fontSize: 11, color: '#45455a', marginBottom: 10 }}>
                    WSDL, OpenAPI, or GraphQL — operations are parsed from this services schema only.
                  </div>
                  {dataLoading ? (
                    <div style={s.empty}>Loading schemas…</div>
                  ) : serviceSchemas.length === 0 ? (
                    <div style={s.empty}>No services schemas. Upload WSDL or OpenAPI in Schema Management.</div>
                  ) : (
                    <select
                      style={s.input}
                      value={form.servicesSchemaId}
                      onChange={e => handleServicesSchemaChange(e.target.value)}>
                      <option value="">— Select services schema —</option>
                      {serviceSchemas.map(sc => (
                        <option key={sc.id} value={sc.id}>
                          {sc.label} ({sc.version}) · {sc.schemaType}
                          {sc.operations?.length ? ` · ${sc.operations.length} ops` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedServicesSchema && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 11, color: '#6b6b80' }}>
                        Version <span style={{ fontFamily: 'monospace', color: '#9090a0' }}>{selectedServicesSchema.version}</span>
                        {schemaOps.length > 0 && (
                          <> · <strong style={{ color: '#22c55e' }}>{schemaOps.length}</strong> operations parsed</>
                        )}
                      </span>
                      {form.servicesSchemaId && (
                        <button type="button" style={s.linkBtn} disabled={loadingSchemaOps}
                          onClick={() => loadSchemaOperations(form.servicesSchemaId, true)}>
                          {loadingSchemaOps ? 'Parsing…' : 'Re-parse from file'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={s.section}>
                  <div style={s.secTitle}>2. Data model schema *</div>
                  <div style={{ fontSize: 11, color: '#45455a', marginBottom: 10 }}>
                    XSD (or related) — used for field mapping in the designer.
                  </div>
                  {dataLoading ? (
                    <div style={s.empty}>Loading schemas…</div>
                  ) : dataModelSchemas.length === 0 ? (
                    <div style={s.empty}>No data model schemas. Upload XSD in Schema Management.</div>
                  ) : (
                    <select style={s.input} value={form.dataModelSchemaId}
                      onChange={e => handleDataModelSchemaChange(e.target.value)}>
                      <option value="">— Select data model schema —</option>
                      {dataModelSchemas.map(sc => (
                        <option key={sc.id} value={sc.id}>{sc.label} ({sc.version}) · {sc.schemaType}</option>
                      ))}
                    </select>
                  )}
                  {selectedDataModelSchema && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#6b6b80' }}>
                      Version <span style={{ fontFamily: 'monospace', color: '#9090a0' }}>{selectedDataModelSchema.version}</span>
                    </div>
                  )}
                </div>

                <div style={s.section}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={s.secTitle}>3. Operations from services schema * ({selectedOperations.length} selected)</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" style={s.linkBtn} disabled={!form.servicesSchemaId || schemaOps.length === 0} onClick={selectAllVisible}>Select all</button>
                      <button type="button" style={s.linkBtn} onClick={clearOperations}>Clear</button>
                    </div>
                  </div>

                  {!form.servicesSchemaId ? (
                    <div style={s.empty}>Select a services schema (step 1) to load operations.</div>
                  ) : !form.dataModelSchemaId ? (
                    <div style={s.empty}>Select a data model schema (step 2) before choosing operations.</div>
                  ) : loadingSchemaOps ? (
                    <div style={s.empty}>Parsing services schema…</div>
                  ) : schemaOps.length === 0 ? (
                    <div style={s.empty}>No operations found. Re-parse the services schema or re-upload it.</div>
                  ) : filteredSchemaOps.length === 0 ? (
                    <div style={s.empty}>No operations match your filter.</div>
                  ) : (
                    <>
                      <input style={{ ...s.input, marginBottom: 10 }} placeholder="Filter operations…"
                        value={actionFilter} onChange={e => setActionFilter(e.target.value)} />
                      <div style={s.actionList}>
                        {filteredSchemaOps.map(op => {
                          const checked = selectedOperations.includes(op.name);
                          return (
                            <label key={op.name} style={{ ...s.actionRow, ...(checked ? s.actionRowOn : {}) }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleOperation(op.name)}
                                style={{ width: 14, height: 14, accentColor: '#4f8ef7', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#f0f0f4' }}>{op.label}</div>
                                <div style={{ fontSize: 10, color: '#45455a', fontFamily: 'monospace' }}>
                                  {op.name}
                                  {op.method ? ` · ${op.method}` : ''}
                                  {op.endpoint ? ` · ${op.endpoint}` : ''}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: 10, fontSize: 10, color: '#45455a' }}>
                    Saved under FloPlugConnectors/…/FloKits/{form.id}/FloKitActions
                  </div>
                </div>

                <div style={s.footerRow}>
                  <button type="button" style={s.cancelBtn} onClick={() => setEditorTab('details')}>
                    ← Back to details
                  </button>
                  <button type="button" style={s.primaryBtn} onClick={handleSaveConfiguration}
                    disabled={saving || dataLoading || loadingSchemaOps || !form.servicesSchemaId || !form.dataModelSchemaId || selectedOperations.length === 0}>
                    {saving ? 'Saving…' : 'Save schema & operations'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : selectedConn ? (
          <div style={{ ...s.editor, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={s.empty}>Select a FloKit from the list, or click <strong>+ New</strong> to create one.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  root:       { padding: '8px 0 28px', color: '#f0f0f4', fontFamily: "'Inter',-apple-system,sans-serif", width: '100%' },
  header:     { marginBottom: 20 },
  title:      { fontSize: 20, fontWeight: 700, color: '#f0f0f4', marginBottom: 4 },
  subtitle:   { fontSize: 12, color: '#6b6b80', maxWidth: 800, lineHeight: 1.7 },
  body:       { display: 'flex', gap: 16, alignItems: 'flex-start', width: '100%' },
  connList:   { flex: '0 0 180px', display: 'flex', flexDirection: 'column', gap: 4 },
  kitList:    { flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: 4 },
  editor:     { flex: 1, minWidth: 0, background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  tabBar:     { display: 'flex', gap: 4, borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: 10, marginBottom: 4 },
  tab:        { padding: '8px 16px', borderRadius: '6px 6px 0 0', border: 'none', background: 'transparent', color: '#6b6b80', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 },
  tabOn:      { background: 'rgba(79,142,247,0.12)', color: '#4f8ef7', fontWeight: 600 },
  tabDisabled:{ opacity: 0.45, cursor: 'not-allowed' },
  tabBadge:   { fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(79,142,247,0.25)', color: '#4f8ef7' },
  colHeader:  { fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, padding: '0 2px' },
  listItem:   { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' },
  listOn:     { background: '#1e2130', borderColor: 'rgba(79,142,247,0.3)' },
  listName:   { fontSize: 12, fontWeight: 600, color: '#f0f0f4' },
  listMeta:   { fontSize: 10, color: '#45455a', marginTop: 2, fontFamily: 'monospace' },
  section:    { background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px 16px' },
  secTitle:   { fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 0 },
  fl:         { fontSize: 10, color: '#6b6b80', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, display: 'block' },
  input:      { padding: '8px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  inputDim:   { opacity: 0.5, cursor: 'not-allowed' },
  empty:      { fontSize: 12, color: '#45455a', lineHeight: 1.6, padding: '8px 4px' },
  chip:       { fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, border: '0.5px solid transparent', flexShrink: 0 },
  chipGreen:  { background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' },
  chipRed:    { background: 'rgba(239,68,68,0.1)',  color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' },
  chipAmber:  { background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '0.5px solid rgba(245,158,11,0.35)', fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, flexShrink: 0 },
  addBtn:     { padding: '3px 10px', borderRadius: 5, border: '0.5px solid rgba(79,142,247,0.3)', background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  linkBtn:    { padding: 0, border: 'none', background: 'none', color: '#4f8ef7', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  primaryBtn: { padding: '8px 18px', borderRadius: 7, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  secondaryBtn:{ padding: '8px 18px', borderRadius: 7, border: '0.5px solid rgba(79,142,247,0.4)', background: 'rgba(79,142,247,0.08)', color: '#4f8ef7', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn:  { padding: '8px 18px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b6b80', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  footerRow:  { display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' as const, paddingTop: 4 },
  errBanner:  { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.25)', color: '#f87171', fontSize: 12 },
  okBanner:   { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.25)', color: '#22c55e', fontSize: 12 },
  warnBanner: { padding: '10px 14px', borderRadius: 7, background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: 12 },
  actionList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' as const },
  actionRow:  { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' },
  actionRowOn:{ borderColor: 'rgba(79,142,247,0.35)', background: 'rgba(79,142,247,0.08)' },
};

export default FloKitManagement;
