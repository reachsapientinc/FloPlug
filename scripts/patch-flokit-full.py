#!/usr/bin/env python3
"""Patch FloKitManagement.tsx for services + data model schemas and FloKitActions subcollection."""
from pathlib import Path
import re

p = Path(__file__).resolve().parents[1] / "frontend/src/modules/FloKitManagement.tsx"
text = p.read_text()

# imports
text = text.replace(
    "import { validateFloKitIdentity, validateFloKitConfiguration } from '@floplug/shared';",
    """import {
  validateFloKitIdentity, validateFloKitConfiguration,
  isFloKitConfigured, resolveKitServicesSchemaId,
} from '@floplug/shared';""",
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
});

function operationDocId""",
    """const emptyKit = (connectorId: string): FloKitDoc => ({
  id: '', name: '', description: '',
  connectorId,
  servicesSchemaId: '', servicesSchemaVersion: '',
  dataModelSchemaId: '', dataModelSchemaVersion: '',
  actionIds: [],
  kitVersion: '1.0.0',
  availableForTiers: [],
  isActive: true,
});

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

function operationDocId""",
)

# loadConnectorCatalog: drop connector ACTIONS load
text = re.sub(
    r"const \[schemaSnap, actionSnap, kitSnap\] = await Promise\.all\(\[",
    "const [schemaSnap, kitSnap] = await Promise.all([",
    text,
)
text = re.sub(
    r"\),\s*getDocs\(query\(\s*collection\(db, COLLECTIONS\.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS\.ACTIONS\),[\s\S]*?\)\),\s*getDocs\(query\(",
    "),\n        getDocs(query(",
    text,
)
text = text.replace(
    "setActions(actionSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActionDoc)));",
    "setActions([]);",
)

# applyKitToForm block - replace handleSelectKit section helpers
old_apply = """  const applyKitToForm = (kit: FloKitDoc) => {
    setForm({
      ...emptyKit(kit.connectorId || selectedConn || ''),
      ...kit,
      actionIds: kit.actionIds ?? [],
      schemaId: kit.schemaId ?? '',
      schemaVersion: kit.schemaVersion ?? '',
      kitVersion: kit.kitVersion ?? '1.0.0',
    });
    setKitPersisted(true);
    setEditorTab(kitNeedsConfiguration(kit) ? 'configure' : 'details');
  };"""

new_apply = """  const loadKitActions = useCallback(async (connId: string, kitId: string) => {
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
  };"""

if old_apply in text:
    text = text.replace(old_apply, new_apply)

# Replace selectedSchema block with service/data model memos + handlers
text = re.sub(
    r"  const selectedSchema = useMemo\(\s*\(\) => schemas\.find\(s => s\.id === form\.schemaId\),\s*\[schemas, form\.schemaId\],\s*\);\n",
    """  const serviceSchemas = useMemo(
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

""",
    text,
)

text = text.replace("form.schemaId", "form.servicesSchemaId")
text = text.replace("selectedSchema", "selectedServicesSchema")
text = text.replace("handleSchemaChange", "handleServicesSchemaChange")
text = text.replace("activeSchemas", "serviceSchemas")

# handleServicesSchemaChange body
text = text.replace(
    """  const handleServicesSchemaChange = (schemaId: string) => {
    const schema = schemas.find(s => s.id === schemaId);
    patch({
      servicesSchemaId: schemaId,
      servicesSchemaVersion: schema?.version ?? '',
      actionIds: [],
    });""",
    """  const handleServicesSchemaChange = (schemaId: string) => {
    const schema = schemas.find(s => s.id === schemaId);
    patch({
      servicesSchemaId: schemaId,
      servicesSchemaVersion: schema?.version ?? '',
      actionIds: [],
    });""",
)

if "handleDataModelSchemaChange" not in text:
    text = text.replace(
        "  const handleServicesSchemaChange = (schemaId: string) => {",
        """  const handleDataModelSchemaChange = (schemaId: string) => {
    const schema = schemas.find(s => s.id === schemaId);
    patch({
      dataModelSchemaId: schemaId,
      dataModelSchemaVersion: schema?.version ?? '',
    });
  };

  const handleServicesSchemaChange = (schemaId: string) => {""",
    )

# upsert actions path
old_upsert = re.search(
    r"  const upsertActionsForOperations = async \([\s\S]*?return saved;\n  \};",
    text,
)
if old_upsert and "floKitActionsPath" not in old_upsert.group(0):
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
    text = text[: old_upsert.start()] + new_upsert + text[old_upsert.end() :]

# validateFloKitConfiguration call
text = re.sub(
    r"validateFloKitConfiguration\(\s*selectedOperations,\s*allowedNames,\s*form\.servicesSchemaId,\s*\)",
    "validateFloKitConfiguration(\n      selectedOperations,\n      allowedNames,\n      form.servicesSchemaId,\n      form.dataModelSchemaId,\n    )",
    text,
)

# handleSaveConfiguration payload
text = re.sub(
    r"const payload: FloKitDoc = \{[\s\S]*?actionIds,\s*\};",
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

# sync action nodes
if "servicesSchemaId:" not in text.split("syncActionNodeTemplates")[1][:800]:
    text = text.replace(
        "schemaId:      kit.schemaId,\n        schemaVersion: kit.schemaVersion,",
        """servicesSchemaId:        resolveKitServicesSchemaId(kit),
        servicesSchemaVersion:   kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',
        dataModelSchemaId:       kit.dataModelSchemaId,
        dataModelSchemaVersion:  kit.dataModelSchemaVersion ?? '',
        wsdlSchemaId:      resolveKitServicesSchemaId(kit),
        wsdlSchemaVersion: kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',
        schemaId:          resolveKitServicesSchemaId(kit),
        schemaVersion:     kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? '',""",
    )

# Configure UI section replacement
cfg_start = text.find("{editorTab === 'configure' && kitSaved && (")
if cfg_start != -1:
    sec = text.find("<div style={s.section}>", cfg_start)
    footer = text.find("<motion style={s.footerRow}>".replace("motion", "div"), cfg_start)
    if footer == -1:
        footer = text.find("style={s.footerRow}", cfg_start)
    if sec != -1 and footer != -1:
        D = "div"
        new_ui = f"""
                <{D} style={{s.section}}>
                  <{D} style={{s.secTitle}}>1. Services schema *</{D}>
                  <{D} style={{{{ fontSize: 11, color: '#45455a', marginBottom: 10 }}}}>
                    WSDL, OpenAPI, or GraphQL — operations are parsed from this services schema only.
                  </{D}>
                  {{dataLoading ? (
                    <{D} style={{s.empty}}>Loading schemas…</{D}>
                  ) : serviceSchemas.length === 0 ? (
                    <{D} style={{s.empty}}>No services schemas. Upload WSDL or OpenAPI in Schema Management.</{D}>
                  ) : (
                    <select
                      style={{s.input}}
                      value={{form.servicesSchemaId}}
                      onChange={{e => handleServicesSchemaChange(e.target.value)}}>
                      <option value="">— Select services schema —</option>
                      {{serviceSchemas.map(sc => (
                        <option key={{sc.id}} value={{sc.id}}>
                          {{sc.label}} ({{sc.version}}) · {{sc.schemaType}}
                        </option>
                      ))}}
                    </select>
                  )}}
                  {{selectedServicesSchema && (
                    <{D} style={{{{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}}}>
                      <span style={{{{ fontSize: 11, color: '#6b6b80' }}}}>
                        Version <span style={{{{ fontFamily: 'monospace', color: '#9090a0' }}}}>{{selectedServicesSchema.version}}</span>
                      </span>
                      {{form.servicesSchemaId && (
                        <button type="button" style={{s.linkBtn}} disabled={{loadingSchemaOps}}
                          onClick={{() => loadSchemaOperations(form.servicesSchemaId, true)}}>
                          {{loadingSchemaOps ? 'Parsing…' : 'Re-parse from file'}}
                        </button>
                      )}}
                    </{D}>
                  )}}
                </{D}>

                <{D} style={{{{ ...s.section, marginTop: 16 }}}}>
                  <{D} style={{s.secTitle}}>2. Data model schema *</{D}>
                  <{D} style={{{{ fontSize: 11, color: '#45455a', marginBottom: 10 }}}}>
                    XSD or related data model — used in the designer for field mapping.
                  </{D}>
                  {{dataLoading ? (
                    <{D} style={{s.empty}}>Loading schemas…</{D}>
                  ) : dataModelSchemas.length === 0 ? (
                    <{D} style={{s.empty}}>No XSD data model schemas. Upload one in Schema Management.</{D}>
                  ) : (
                    <select style={{s.input}} value={{form.dataModelSchemaId}}
                      onChange={{e => handleDataModelSchemaChange(e.target.value)}}>
                      <option value="">— Select data model schema —</option>
                      {{dataModelSchemas.map(sc => (
                        <option key={{sc.id}} value={{sc.id}}>{{sc.label}} ({{sc.version}})</option>
                      ))}}
                    </select>
                  )}}
                  {{selectedDataModelSchema && (
                    <{D} style={{{{ marginTop: 8, fontSize: 11, color: '#6b6b80' }}}}>
                      Version <span style={{{{ fontFamily: 'monospace', color: '#9090a0' }}}}>{{selectedDataModelSchema.version}}</span>
                    </{D}>
                  )}}
                </{D}>

                <{D} style={{{{ ...s.section, marginTop: 16 }}}}>
                  <{D} style={{{{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}}}>
                    <{D} style={{s.secTitle}}>3. Operations (from services schema) * ({{selectedOperations.length}} selected)</{D}>
                    <{D} style={{{{ display: 'flex', gap: 8 }}}}>
                      <button type="button" style={{s.linkBtn}} disabled={{!form.servicesSchemaId || schemaOps.length === 0}} onClick={{selectAllVisible}}>Select all</button>
                      <button type="button" style={{s.linkBtn}} onClick={{clearOperations}}>Clear</button>
                    </{D}>
                  </{D}>
                  {{!form.servicesSchemaId ? (
                    <{D} style={{s.empty}}>Select a services schema (step 1) to load operations.</{D}>
                  ) : !form.dataModelSchemaId ? (
                    <{D} style={{s.empty}}>Select a data model schema (step 2) — both are required.</{D}>
                  ) : loadingSchemaOps ? (
                    <{D} style={{s.empty}}>Parsing services schema…</{D}>
                  ) : schemaOps.length === 0 ? (
                    <{D} style={{s.empty}}>No operations found. Re-parse the services schema file.</{D}>
                  ) : filteredSchemaOps.length === 0 ? (
                    <{D} style={{s.empty}}>No operations match your filter.</{D}>
                  ) : (
                    <>
                      <input style={{{{ ...s.input, marginBottom: 10 }}}} placeholder="Filter operations…"
                        value={{actionFilter}} onChange={{e => setActionFilter(e.target.value)}} />
                      <{D} style={{s.actionList}}>
                        {{filteredSchemaOps.map(op => {{
                          const checked = selectedOperations.includes(op.name);
                          return (
                            <label key={{op.name}} style={{{{ ...s.actionRow, ...(checked ? s.actionRowOn : {{}}) }}}}>
                              <input type="checkbox" checked={{checked}} onChange={{() => toggleOperation(op.name)}} />
                              <{D} style={{{{ flex: 1 }}}}>{{op.label}} <span style={{{{ fontFamily: 'monospace', fontSize: 10, color: '#45455a' }}}}>{{op.name}}</span></{D}>
                            </label>
                          );
                        }})}}
                      </{D}>
                    </>
                  )}}
                  <{D} style={{{{ fontSize: 10, color: '#45455a', marginTop: 8 }}}}>
                    Saved under FloPlugConnectors/…/FloKits/{{form.id}}/FloKitActions
                  </{D}>
                </{D}>
"""
        text = text[:sec] + new_ui + text[footer:]

# save button disabled
text = text.replace(
    "disabled={saving || dataLoading || loadingSchemaOps || selectedOperations.length === 0}",
    "disabled={saving || dataLoading || loadingSchemaOps || !form.servicesSchemaId || !form.dataModelSchemaId || selectedOperations.length === 0}",
)

text = text.replace(
    "<strong> Step 2:</strong> Open <em>Schema &amp; Actions</em> to pick a schema version and select operations.",
    "<strong> Step 2:</strong> Pick services + data model schemas, then select operations (stored under this FloKit).",
)

p.write_text(text)
print("patched", p)
