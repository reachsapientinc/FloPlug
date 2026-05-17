#!/usr/bin/env python3
from pathlib import Path

D = "d" + "iv"

p = Path(__file__).resolve().parents[1] / "frontend/src/modules/FloKitManagement.tsx"
t = p.read_text()

replacements = [
    ("form.schemaId", "form.wsdlSchemaId"),
    ("handleSchemaChange", "handleWsdlSchemaChange"),
    ("selectedSchema", "selectedWsdlSchema"),
    ("activeSchemas.length", "wsdlSchemas.length"),
    ("activeSchemas.map", "wsdlSchemas.map"),
    (f"<{D} style={{s.secTitle}}>Schema *</{D}>", f"<{D} style={{s.secTitle}}>WSDL / OpenAPI schema (operations) *</{D}>"),
    (
        "Operations are parsed from the schema file in Cloud Storage (WSDL, OpenAPI, or XSD).",
        "Operations are parsed from the WSDL or OpenAPI file in Cloud Storage.",
    ),
    (
        "No schemas for this connector. Upload one in Schema Management → Schemas tab.",
        "No WSDL/OpenAPI schemas. Upload one in Schema Management.",
    ),
    ("— Select schema —", "— Select WSDL/OpenAPI schema —"),
    (
        "Select a schema above to load operations.",
        "Select a WSDL/OpenAPI schema above to load operations.",
    ),
]
for a, b in replacements:
    t = t.replace(a, b)

marker = f"""                <{D} style={{s.section}}>
                  <{D} style={{{{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}}}>
                    <{D} style={{s.secTitle}}>Schema operations *"""

if "Data model schema (XSD)" not in t and marker in t:
    xsd = f"""
                <{D} style={{{{ ...s.section, marginTop: 16 }}}}>
                  <{D} style={{s.secTitle}}>Data model schema (XSD) *</{D}>
                  <{D} style={{{{ fontSize: 11, color: '#45455a', marginBottom: 10 }}}}>
                    Used in the designer for field mapping on operations in this kit.
                  </{D}>
                  {{dataLoading ? (
                    <{D} style={{s.empty}}>Loading schemas…</{D}>
                  ) : dataModelSchemas.length === 0 ? (
                    <{D} style={{s.empty}}>
                      No XSD schemas. Upload a data model in Schema Management.
                    </{D}>
                  ) : (
                    <select
                      style={{s.input}}
                      value={{form.dataModelSchemaId}}
                      onChange={{e => handleDataModelSchemaChange(e.target.value)}}>
                      <option value="">— Select XSD data model —</option>
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

"""
    t = t.replace(marker, xsd + marker)

p.write_text(t)
print("updated", p)
