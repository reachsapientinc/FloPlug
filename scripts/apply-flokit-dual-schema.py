#!/usr/bin/env python3
"""Apply dual-schema + FloKitActions changes to FloKitManagement.tsx (idempotent-ish)."""
from pathlib import Path
import re

PATH = Path(__file__).resolve().parents[1] / "frontend/src/modules/FloKitManagement.tsx"
text = PATH.read_text()

# --- imports & emptyKit ---
text = text.replace(
    "import { validateFloKitIdentity, validateFloKitConfiguration } from '@floplug/shared';",
    "import {\n"
    "  validateFloKitIdentity, validateFloKitConfiguration,\n"
    "  isFloKitConfigured, resolveKitServicesSchemaId,\n"
    "} from '@floplug/shared';",
)
text = text.replace(
    """const emptyKit = (connectorId: string): FloKitDoc => ({
  id: '', name: '', description: '',
  connectorId,
  schemaId: '', schemaVersion: '',
  actionIds: [],
  kitVersion: '1.0.0',
  availableForTiers: [],
  isActive: true,
});""",
    """const emptyKit = (connectorId: string): FloKitDoc => ({
  id: '', name: '', description: '',
  connectorId,
  servicesSchemaId: '', servicesSchemaVersion: '',
  dataModelSchemaId: '', dataModelSchemaVersion: '',
  actionIds: [],
  kitVersion: '1.0.0',
  availableForTiers: [],
  isActive: true,
});""",
)
text = text.replace(
    "function kitNeedsConfiguration(kit: FloKitDoc): boolean {\n"
    "  return !kit.schemaId?.trim() || !(kit.actionIds?.length);\n"
    "}",
    "function kitNeedsConfiguration(kit: FloKitDoc): boolean {\n"
    "  return !isFloKitConfigured(kit);\n"
    "}\n\n"
    "function hydrateKitFromFirestore(kit: FloKitDoc, connectorId: string): FloKitDoc {\n"
    "  const servicesSchemaId = resolveKitServicesSchemaId(kit);\n"
    "  return {\n"
    "    ...emptyKit(connectorId),\n"
    "    ...kit,\n"
    "    connectorId,\n"
    "    servicesSchemaId,\n"
    "    servicesSchemaVersion:\n"
    "      kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',\n"
    "    dataModelSchemaId: kit.dataModelSchemaId ?? '',\n"
    "    dataModelSchemaVersion: kit.dataModelSchemaVersion ?? '',\n"
    "    actionIds: kit.actionIds ?? [],\n"
    "    kitVersion: kit.kitVersion ?? '1.0.0',\n"
    "  };\n"
    "}\n\n"
    "function floKitActionsPath(connId: string, kitId: string) {\n"
    "  return [\n"
    "    COLLECTIONS.FLOPLUGCONNECTORS, connId,\n"
    "    SUB_COLLECTIONS.FLOKITS, kitId,\n"
    "    SUB_COLLECTIONS.FLOKITACTIONS,\n"
    "  ] as const;\n"
    "}",
)

# --- catalog load: no connector-level Actions ---
text = text.replace(
    "      const [schemaSnap, actionSnap, kitSnap] = await Promise.all([\n"
    "        getDocs(query(\n"
    "          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.SCHEMAS),\n"
    "          orderBy('label'),\n"
    "        )),\n"
    "        getDocs(query(\n"
    "          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.ACTIONS),\n"
    "          orderBy('label'),\n"
    "        )),\n"
    "        getDocs(query(\n"
    "          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.FLOKITS),\n"
    "          orderBy('name'),\n"
    "        )),\n"
    "      ]);\n"
    "      setSchemas(schemaSnap.docs.map(d => ({ id: d.id, ...d.data() } as ConnectorSchema)));\n"
    "      setActions(actionSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActionDoc)));\n"
    "      setFloKits(kitSnap.docs.map(d => ({ id: d.id, ...d.data() } as FloKitDoc)));",
    "      const [schemaSnap, kitSnap] = await Promise.all([\n"
    "        getDocs(query(\n"
    "          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.SCHEMAS),\n"
    "          orderBy('label'),\n"
    "        )),\n"
    "        getDocs(query(\n"
    "          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.FLOKITS),\n"
    "          orderBy('name'),\n"
    "        )),\n"
    "      ]);\n"
    "      setSchemas(schemaSnap.docs.map(d => ({ id: d.id, ...d.data() } as ConnectorSchema)));\n"
    "      setActions([]);\n"
    "      setFloKits(kitSnap.docs.map(d => ({ id: d.id, ...d.data() } as FloKitDoc)));",
)

# --- loadKitActions + applyKitToForm ---
if "loadKitActions" not in text:
    text = text.replace(
        "  const applyKitToForm = (kit: FloKitDoc) => {\n"
        "    setForm({\n"
        "      ...emptyKit(kit.connectorId || selectedConn || ''),\n"
        "      ...kit,\n"
        "      actionIds: kit.actionIds ?? [],\n"
        "      schemaId: kit.schemaId ?? '',\n"
        "      schemaVersion: kit.schemaVersion ?? '',\n"
        "      kitVersion: kit.kitVersion ?? '1.0.0',\n"
        "    });\n"
        "    setKitPersisted(true);\n"
        "    setEditorTab(kitNeedsConfiguration(kit) ? 'configure' : 'details');\n"
        "  };",
        "  const loadKitActions = useCallback(async (connId: string, kitId: string) => {\n"
        "    if (!kitId) { setActions([]); return; }\n"
        "    try {\n"
        "      const snap = await getDocs(\n"
        "        query(collection(db, ...floKitActionsPath(connId, kitId)), orderBy('label')),\n"
        "      );\n"
        "      setActions(snap.docs.map(d => ({ id: d.id, ...d.data(), floKitId: kitId } as ActionDoc)));\n"
        "    } catch {\n"
        "      setActions([]);\n"
        "    }\n"
        "  }, []);\n\n"
        "  const applyKitToForm = (kit: FloKitDoc) => {\n"
        "    const connId = kit.connectorId || selectedConn || '';\n"
        "    setForm(hydrateKitFromFirestore(kit, connId));\n"
        "    setKitPersisted(true);\n"
        "    setEditorTab(kitNeedsConfiguration(kit) ? 'configure' : 'details');\n"
        "    if (connId && kit.id) void loadKitActions(connId, kit.id);\n"
        "  };",
    )

# --- schema memos ---
text = text.replace(
    "  const selectedSchema = useMemo(\n"
    "    () => schemas.find(s => s.id === form.schemaId),\n"
    "    [schemas, form.schemaId],\n"
    "  );",
    "  const serviceSchemas = useMemo(\n"
    "    () => schemas.filter(s =>\n"
    "      s.isActive !== false &&\n"
    "      (s.schemaType === 'wsdl' || s.schemaType === 'openapi' || s.schemaType === 'graphql'),\n"
    "    ),\n"
    "    [schemas],\n"
    "  );\n"
    "  const dataModelSchemas = useMemo(\n"
    "    () => schemas.filter(s => s.isActive !== false && s.schemaType === 'xsd'),\n"
    "    [schemas],\n"
    "  );\n"
    "  const selectedServicesSchema = useMemo(\n"
    "    () => schemas.find(s => s.id === form.servicesSchemaId),\n"
    "    [schemas, form.servicesSchemaId],\n"
    "  );\n"
    "  const selectedDataModelSchema = useMemo(\n"
    "    () => schemas.find(s => s.id === form.dataModelSchemaId),\n"
    "    [schemas, form.dataModelSchemaId],\n"
    "  );",
)

# fix duplicate else-if if present
text = re.sub(
    r"(\} else if \(!refresh && schema\?\.operations\?\.length\) \{\n)\s*\} else if \(!refresh && schema\?\.operations\?\.length\) \{\n",
    r"\1",
    text,
)

text = text.replace("form.schemaId", "form.servicesSchemaId")
text = text.replace("handleSchemaChange", "handleServicesSchemaChange")

# handleServicesSchemaChange body
text = text.replace(
    "  const handleServicesSchemaChange = (schemaId: string) => {\n"
    "    const schema = schemas.find(s => s.id === schemaId);\n"
    "    patch({\n"
    "      schemaId,\n"
    "      schemaVersion: schema?.version ?? '',\n"
    "      actionIds: [],\n"
    "    });",
    "  const handleServicesSchemaChange = (schemaId: string) => {\n"
    "    const schema = schemas.find(s => s.id === schemaId);\n"
    "    patch({\n"
    "      servicesSchemaId: schemaId,\n"
    "      servicesSchemaVersion: schema?.version ?? '',\n"
    "      actionIds: [],\n"
    "    });",
)

if "handleDataModelSchemaChange" not in text:
    text = text.replace(
        "  const handleServicesSchemaChange = (schemaId: string) => {\n"
        "    const schema = schemas.find(s => s.id === schemaId);\n"
        "    patch({\n"
        "      servicesSchemaId: schemaId,\n"
        "      servicesSchemaVersion: schema?.version ?? '',\n"
        "      actionIds: [],\n"
        "    });\n"
        "    setSelectedOperations([]);\n"
        "    if (schemaId) loadSchemaOperations(schemaId);\n"
        "    else setSchemaOps([]);\n"
        "  };",
        "  const handleServicesSchemaChange = (schemaId: string) => {\n"
        "    const schema = schemas.find(s => s.id === schemaId);\n"
        "    patch({\n"
        "      servicesSchemaId: schemaId,\n"
        "      servicesSchemaVersion: schema?.version ?? '',\n"
        "      actionIds: [],\n"
        "    });\n"
        "    setSelectedOperations([]);\n"
        "    if (schemaId) loadSchemaOperations(schemaId);\n"
        "    else setSchemaOps([]);\n"
        "  };\n\n"
        "  const handleDataModelSchemaChange = (schemaId: string) => {\n"
        "    const schema = schemas.find(s => s.id === schemaId);\n"
        "    patch({\n"
        "      dataModelSchemaId: schemaId,\n"
        "      dataModelSchemaVersion: schema?.version ?? '',\n"
        "    });\n"
        "  };",
    )

# upsertActionsForOperations
old_upsert = re.search(
    r"  const upsertActionsForOperations = async \([\s\S]*?    return saved;\n  \};",
    text,
)
new_upsert = """  const upsertActionsForOperations = async (
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
      const id = operationDocId(name);
      const action: ActionDoc = {
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
      };
      batch.set(doc(actionsCol, id), { ...action, updatedAt: serverTimestamp() }, { merge: true });
      saved.push(action);
    }
    await batch.commit();
    setActions(saved.sort((a, b) => a.label.localeCompare(b.label)));
    return saved;
  };"""
if old_upsert:
    text = text[: old_upsert.start()] + new_upsert + text[old_upsert.end() :]

# syncActionNodeTemplates node
text = text.replace(
    "      const node: FloKitActionNodeDoc = {\n"
    "        id:            action.id,\n"
    "        floKitId:      kitId,\n"
    "        connectorId:   connId,\n"
    "        actionId:      action.id,\n"
    "        actionLabel:   action.label,\n"
    "        schemaId:      kit.schemaId,\n"
    "        schemaVersion: kit.schemaVersion,\n"
    "        kitVersion:    kit.kitVersion,\n"
    "        category:      action.category,\n"
    "        isActive:      true,\n"
    "        updatedAt:     now as unknown,\n"
    "      };",
    "      const servicesId = resolveKitServicesSchemaId(kit);\n"
    "      const node: FloKitActionNodeDoc = {\n"
    "        id:            action.id,\n"
    "        floKitId:      kitId,\n"
    "        connectorId:   connId,\n"
    "        actionId:      action.id,\n"
    "        actionLabel:   action.label,\n"
    "        servicesSchemaId:        servicesId,\n"
    "        servicesSchemaVersion:   kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',\n"
    "        dataModelSchemaId:       kit.dataModelSchemaId,\n"
    "        dataModelSchemaVersion:  kit.dataModelSchemaVersion ?? '',\n"
    "        wsdlSchemaId:      servicesId,\n"
    "        wsdlSchemaVersion: kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',\n"
    "        schemaId:          servicesId,\n"
    "        schemaVersion:     kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',\n"
    "        kitVersion:    kit.kitVersion,\n"
    "        category:      action.category,\n"
    "        isActive:      true,\n"
    "        updatedAt:     now as unknown,\n"
    "      };",
)

# handleSaveConfiguration
text = re.sub(
    r"const validationError = validateFloKitConfiguration\(\s*selectedOperations,\s*allowedNames,\s*form\.servicesSchemaId,\s*\);",
    "const validationError = validateFloKitConfiguration(\n"
    "      selectedOperations,\n"
    "      allowedNames,\n"
    "      form.servicesSchemaId,\n"
    "      form.dataModelSchemaId,\n"
    "    );",
    text,
)
text = re.sub(
    r"const payload: FloKitDoc = \{\s*\.\.\.form,\s*connectorId:\s*selectedConn,\s*schemaVersion: selectedSchema\?\.version \?\? form\.schemaVersion,\s*actionIds,\s*\};",
    """const servicesVer = selectedServicesSchema?.version ?? form.servicesSchemaVersion;
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
    };""",
    text,
)

text = text.replace(
    "  const activeSchemas = schemas.filter(s => s.isActive !== false);\n  const showEditor",
    "  const showEditor",
)
text = text.replace(
    "<strong> Step 2:</strong> Open <em>Schema &amp; Actions</em> to pick a schema version and select operations.",
    "<strong> Step 2:</strong> Pick <em>services schema</em> + <em>data model schema</em>, then select operations (stored under this FloKit).",
)

# configure tab UI
cfg_marker = "{editorTab === 'configure' && kitSaved && ("
cfg_start = text.find(cfg_marker)
if cfg_start != -1:
    footer = text.find("<motion style={s.footerRow}>".replace("motion", "div"), cfg_start)
    if footer == -1:
        footer = text.find("<div style={s.footerRow}>", cfg_start)
    end = text.find("              </>\n            )}", footer)
    if footer != -1 and end != -1:
        new_cfg = """
            {editorTab === 'configure' && kitSaved && (
              <>
                <motion style={s.section}>
                  <div style={s.secTitle}>1. Services schema *</motion>
                  <div style={{ fontSize: 11, color: '#45455a', marginBottom: 10 }}>
                    WSDL, OpenAPI, or GraphQL — operations are parsed from this services schema only.
                  </div>
                  {dataLoading ? (
                    <div style={s.empty}>Loading schemas…</div>
                  ) : serviceSchemas.length === 0 ? (
                    <motion style={s.empty}>No services schemas. Upload WSDL or OpenAPI in Schema Management.</motion>
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
                  <motion style={{ fontSize: 11, color: '#45455a', marginBottom: 10 }}>
                    XSD (or related) — used for field mapping in the designer.
                  </motion>
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
                    <div style={s.secTitle}>3. Operations from services schema * ({selectedOperations.length} selected)</motion>
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
                    <div style={s.empty}>No operations found. Re-parse the services schema or re-upload it.</motion>
                  ) : filteredSchemaOps.length === 0 ? (
                    <div style={s.empty}>No operations match your filter.</motion>
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
            )}""".replace("<motion", "<motion").replace("</motion>", "</motion>")
        # fix accidental motion tags
        new_cfg = new_cfg.replace("<motion", "<div").replace("</motion>", "</motion>")
        new_cfg = new_cfg.replace("</motion>", "</div>")
        text = text[:cfg_start] + new_cfg.strip() + text[end + len("              </>\n            )}") :]

PATH.write_text(text)
print("patched", PATH)
print("servicesSchemaId", "servicesSchemaId" in PATH.read_text())
print("Data model schema", "2. Data model schema" in PATH.read_text())
