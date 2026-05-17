#!/usr/bin/env python3
from pathlib import Path

D = "d" + "iv"
p = Path(__file__).resolve().parents[1] / "frontend/src/modules/FloKitManagement.tsx"
lines = p.read_text().splitlines(keepends=True)

# Replace configure tab body: from first section after `{editorTab === 'configure'` through before footerRow
cfg_idx = next(i for i, l in enumerate(lines) if "editorTab === 'configure' && kitSaved" in l)
sec_start = next(i for i in range(cfg_idx, len(lines)) if lines[i].strip().startswith(f"<{D}") and "s.section" in lines[i])
footer_idx = next(i for i in range(sec_start, len(lines)) if "footerRow" in lines[i] and f"<{D}" in lines[i])

new_block = f'''                <{D} style={{s.section}}>
                  <{D} style={{s.secTitle}}>1. Services schema *</{D}>
                  <{D} style={{{{ fontSize: 11, color: '#45455a', marginBottom: 10 }}}}>
                    WSDL, OpenAPI, or other service definition — operations are parsed from this file only.
                  </{D}>
                  {{dataLoading ? (
                    <{D} style={{s.empty}}>Loading schemas…</{D}>
                  ) : serviceSchemas.length === 0 ? (
                    <{D} style={{s.empty}}>
                      No services schemas. Upload WSDL or OpenAPI in Schema Management.
                    </{D}>
                  ) : (
                    <select
                      style={{s.input}}
                      value={{form.servicesSchemaId}}
                      onChange={{e => handleServicesSchemaChange(e.target.value)}}>
                      <option value="">— Select services schema —</option>
                      {{serviceSchemas.map(sc => (
                        <option key={{sc.id}} value={{sc.id}}>
                          {{sc.label}} ({{sc.version}}) · {{sc.schemaType}}
                          {{sc.operations?.length ? ` · ${{sc.operations.length}} ops` : ''}}
                        </option>
                      ))}}
                    </select>
                  )}}
                  {{selectedServicesSchema && (
                    <{D} style={{{{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}}}>
                      <span style={{{{ fontSize: 11, color: '#6b6b80' }}}}>
                        Version <span style={{{{ fontFamily: 'monospace', color: '#9090a0' }}}}>{{selectedServicesSchema.version}}</span>
                        {{schemaOps.length > 0 && (
                          <> · <strong style={{{{ color: '#22c55e' }}}}>{{schemaOps.length}}</strong> operations parsed</>
                        )}}
                      </span>
                      {{form.servicesSchemaId && (
                        <button
                          type="button"
                          style={{s.linkBtn}}
                          disabled={{loadingSchemaOps}}
                          onClick={{() => loadSchemaOperations(form.servicesSchemaId, true)}}
                        >
                          {{loadingSchemaOps ? 'Parsing…' : 'Re-parse from file'}}
                        </button>
                      )}}
                    </{D}>
                  )}}
                </{D}>

                <{D} style={{{{ ...s.section, marginTop: 16 }}}}>
                  <{D} style={{s.secTitle}}>2. Data model schema *</{D}>
                  <{D} style={{{{ fontSize: 11, color: '#45455a', marginBottom: 10 }}}}>
                    XSD or related data model — used in the designer for field mapping on these operations.
                  </{D}>
                  {{dataLoading ? (
                    <{D} style={{s.empty}}>Loading schemas…</{D}>
                  ) : dataModelSchemas.length === 0 ? (
                    <{D} style={{s.empty}}>
                      No data model (XSD) schemas. Upload one in Schema Management.
                    </{D}>
                  ) : (
                    <select
                      style={{s.input}}
                      value={{form.dataModelSchemaId}}
                      onChange={{e => handleDataModelSchemaChange(e.target.value)}}>
                      <option value="">— Select data model schema —</option>
                      {{dataModelSchemas.map(sc => (
                        <option key={{sc.id}} value={{sc.id}}>
                          {{sc.label}} ({{sc.version}}) · {{sc.schemaType}}
                        </option>
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
                      <button type="button" style={{s.linkBtn}} disabled={{!form.servicesSchemaId || schemaOps.length === 0}} onClick={{selectAllVisible}}>
                        Select all
                      </button>
                      <button type="button" style={{s.linkBtn}} onClick={{clearOperations}}>Clear</button>
                    </{D}>
                  </{D}>

                  {{!form.servicesSchemaId ? (
                    <{D} style={{s.empty}}>Select a services schema above to load operations.</{D}>
                  ) : !form.dataModelSchemaId ? (
                    <{D} style={{s.empty}}>Select a data model schema (step 2) before saving.</{D}>
                  ) : loadingSchemaOps ? (
                    <{D} style={{s.empty}}>Parsing services schema…</{D}>
                  ) : schemaOps.length === 0 ? (
                    <{D} style={{s.empty}}>
                      No operations found. Click <strong>Re-parse from file</strong> or re-upload the services schema.
                    </{D}>
                  ) : filteredSchemaOps.length === 0 ? (
                    <{D} style={{s.empty}}>No operations match your filter.</{D}>
                  ) : (
                    <>
                      <input
                        style={{{{ ...s.input, marginBottom: 10 }}}}
                        placeholder="Filter operations…"
                        value={{actionFilter}}
                        onChange={{e => setActionFilter(e.target.value)}}
                      />
                      <{D} style={{s.actionList}}>
                        {{filteredSchemaOps.map(op => {{
                          const checked = selectedOperations.includes(op.name);
                          return (
                            <label key={{op.name}} style={{{{ ...s.actionRow, ...(checked ? s.actionRowOn : {{}}) }}}}>
                              <input
                                type="checkbox"
                                checked={{checked}}
                                onChange={{() => toggleOperation(op.name)}}
                                style={{{{ width: 14, height: 14, accentColor: '#4f8ef7', flexShrink: 0 }}}}
                              />
                              <{D} style={{{{ flex: 1, minWidth: 0 }}}}>
                                <{D} style={{{{ fontSize: 12, fontWeight: 600, color: '#f0f0f4' }}}}>{{op.label}}</{D}>
                                <{D} style={{{{ fontSize: 10, color: '#45455a', fontFamily: 'monospace' }}}}>
                                  {{op.name}}
                                  {{op.method ? ` · ${{op.method}}` : ''}}
                                  {{op.endpoint ? ` · ${{op.endpoint}}` : ''}}
                                </{D}>
                              </{D}>
                            </label>
                          );
                        }})}}
                      </{D}>
                    </>
                  )}}
                  <{D} style={{{{ fontSize: 10, color: '#45455a', marginTop: 8 }}}}>
                    Actions are saved under FloKits/{{form.id}}/FloKitActions
                  </{D}>
                </{D}>

'''

out = lines[:sec_start] + [new_block] + lines[footer_idx:]
p.write_text("".join(out))
print("ok", sec_start, footer_idx)
