/**
 * src/types/AuthConnectorTypes.ts
 *
 * Single source of truth for auth + connector types.
 * Imported by: AuthManagement, ConnectorManagement, PlugManager, authEngine.
 *
 * v3 changes:
 *   - ConnectorAuthOverride.extraFields: custom fields to ADD to the
 *     base protocol's fields[] when rendering the plug form.
 *     Enables Workday's refreshToken field without touching the seed script.
 *   - HubDoc type added for HubManagement.
 */

// ── Auth Protocol ─────────────────────────────────────────────────────────────
import type {AuthProtocol,ConnectorDoc,HubDoc,AuthProtocolField } from "@floplug/shared";

// export type FieldType = 'text' | 'password' | 'url' | 'textarea' | 'select';



// export interface RuntimeConfig {
//   placementType:             'bearer' | 'basic' | 'header' | 'query';
//   headerName?:               string;
//   headerFormat?:             string;
//   tokenEndpointField?:       string;
//   staticTokenEndpoint?:      string;
//   clientIdField?:            string;
//   clientSecretField?:        string;
//   usernameField?:            string;
//   passwordField?:            string;
//   scopeField?:               string;
//   authEndpointField?:        string;
//   redirectUriField?:         string;
//   issuerField?:              string;
//   audienceField?:            string;
//   privateKeyField?:          string;
//   headerNameField?:          string;
//   placementField?:           string;
//   refreshStrategy:           'none' | 'auto' | 'on_expiry';
//   assertionLifetime?:        number;
//   requiresInteractiveSetup?: boolean;
//   tokenResponseMapping?: {
//     accessToken?:  string;
//     refreshToken?: string;
//     expiresIn?:    string;
//     tokenType?:    string;
//   };
// }



// // ── Connector-level auth override ─────────────────────────────────────────────

// export interface ConnectorAuthOverride {
//   // Override the grant type (e.g. Workday: 'refresh_token' not 'password')
//   grantType?:     string;
//   // Body encoding for token requests
//   bodyFormat?:    'form' | 'json';
//   // Extra static params always sent in token request body
//   extraBodyParams?: Record<string, string>;
//   // Map credential field names → token request param names
//   fieldMappings?: Record<string, string>;
//   // Override token response field names if non-standard
//   tokenResponseMapping?: {
//     accessToken?:  string;
//     refreshToken?: string;
//     expiresIn?:    string;
//   };
//   /**
//    * Extra credential fields to ADD to the protocol's base fields[].
//    * Use this when a connector needs fields the base protocol doesn't define.
//    * Example: Workday OAuth2 password grant needs a 'refreshToken' field
//    * that doesn't exist in the standard oauth2_password protocol.
//    * These fields are merged AFTER the base protocol fields when rendering
//    * the plug form in PlugManager.
//    */
//   extraFields?: AuthProtocolField[];
//   // Free-text notes shown in ConnectorManagement UI
//   notes?: string;
// }

// // ── Connector doc ─────────────────────────────────────────────────────────────

// export interface ConnectorDoc {
//   id:                 string;
//   label:              string;
//   category:           string;
//   supportedAuthTypes: string[];
//   description:        string;
//   isActive:           boolean;
//   authOverride?:      ConnectorAuthOverride;
// }

// export type SchemaType = 'wsdl' | 'xsd' | 'openapi' | 'graphql';
 
// export interface ConnectorSchema {
//   id:           string;
//   connectorId:  string;
//   label:        string;           // e.g. "Human Resources v42.2"
//   version:      string;           // e.g. "v42.2"
//   schemaType:   SchemaType;
//   storagePath:  string;           // gs://floplug-schemas/workday/v42/HR.wsdl
//   isActive:     boolean;
//   uploadedAt?:  Date;
//   uploadedBy?:  string;
//   /** Operations extracted at upload time — names only, no field details */
//   operations?:  string[];
// }
 
// // ─────────────────────────────────────────────────────────────────────────────
// // ParsedField — returned by resolveActionSchema Cloud Function
// // Also used in ActionDoc.inputSchema for simple/manual actions.
// // ─────────────────────────────────────────────────────────────────────────────
 
// export interface ParsedField {
//   path:         string;     // dot-path: "Worker_Data.Personal_Data.Name_Data.First_Name"
//   label:        string;     // human-readable: "First Name"
//   xsdType:      string;     // "xsd:string" | "xsd:date" | "xsd:decimal" | ...
//   required:     boolean;    // from minOccurs in XSD / required in OpenAPI
//   repeating:    boolean;    // maxOccurs > 1 or array in OpenAPI
//   enumValues?:  string[];   // if xsd:enumeration or OpenAPI enum
//   helpText?:    string;     // from xsd:documentation or description
// }

// export type ActionSchemaSource = 'wsdl' | 'xsd' | 'openapi' | 'manual';

// export interface ActionDoc {
//   id:              string;
//   connectorId:     string;
//   label:           string;          // "Create Worker"
//   category:        string;          // "Human Resources"
//   description?:    string;
//   isActive:        boolean;
 
//   // HTTP config
//   method:          'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
//   endpoint:        string;          // "/v1/workers" or "/Human_Resources/v42.2"
//   soapAction?:     string;          // SOAP only: "urn:com.workday/bsvc/Put_Worker"
//   contentType?:    string;          // default: "application/json" or "text/xml"
 
//   // Schema derivation
//   schemaSource:    ActionSchemaSource;
//   schemaRef?:      string;          // ConnectorSchema.id — required if source is wsdl/xsd/openapi
//   operationName?:  string;          // exact name in the WSDL/OpenAPI spec
 
//   /**
//    * inputSchema is populated one of two ways:
//    *   - Automatically: resolveActionSchema parses WSDL/XSD and caches here
//    *   - Manually: product admin fills it in for simple REST actions
//    * For WSDL/XSD actions with hundreds of fields, leave empty and rely on
//    * the cache in Actions/{id}/Cache/parsedSchema
//    */
//   inputSchema?:    ParsedField[];
 
//   /** What keys this action writes back into cStream after a successful call */
//   outputKeys?:     string[];        // e.g. ["workerId", "_actionStatus", "_rawResponse"]
 
//   /** Body template with {{cStream.field}} placeholders — used by actionEngine */
//   bodyTemplate?:   string;          // JSON or XML string
 
//   /** Map response paths back to cStream keys */
//   responseMapping?: Array<{
//     cStreamKey:    string;          // "workerId"
//     responsePath:  string;          // "Worker_Data.Worker_ID"
//   }>;
 
//   createdAt?:  Date;
//   updatedAt?:  Date;
//   createdBy?:  string;
// }

// // ── Plug (connector instance configured by hub admin) ─────────────────────────

// export type PlugCredentialValues = Record<string, string>;

// export interface PlugConfig {
//   id:             string;
//   hubId:          string;
//   tenantId:       string;
//   connectorId:    string;
//   connectorLabel: string;
//   authProtocol:   string;
//   name:           string;
//   baseUrl:        string;
//   credentials:    PlugCredentialValues;
//   isActive:       boolean;
//   createdBy:      string;
//   createdAt?:     any;
//   updatedAt?:     any;
// }



// ── Loaders ───────────────────────────────────────────────────────────────────

import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export async function loadAuthProtocols(): Promise<AuthProtocol[]> {
  const snap = await getDoc(doc(db, 'FloPlugGlobalSettings', 'AuthenticationTypes'));
  if (!snap.exists()) return [];
  const data = snap.data();
  return ((data.authProtocols ?? data.authTypes ?? []) as AuthProtocol[])
    .filter((p: AuthProtocol) => p.isActive)
    .sort((a: AuthProtocol, b: AuthProtocol) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function loadConnectors(): Promise<ConnectorDoc[]> {
  const snap = await getDocs(collection(db, 'FloPlugConnectors'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as ConnectorDoc))
    .filter(c => c.isActive)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadHubs(): Promise<HubDoc[]> {
  const snap = await getDocs(collection(db, 'FloPlugHubs'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as HubDoc))
    .sort((a, b) => a.hubName.localeCompare(b.hubName));
}

/**
 * Merge base protocol fields with connector override extra fields.
 * Called by PlugManager when rendering the credential form.
 * Override extra fields are appended after base fields, deduped by name.
 */
export function mergeProtocolFields(
  protocol:   AuthProtocol,
  connector:  ConnectorDoc,
): AuthProtocolField[] {
  const base  = protocol.fields ?? [];
  const extra = connector.authOverride?.extraFields ?? [];
  const seen  = new Set(base.map(f => f.name));
  return [...base, ...extra.filter(f => !seen.has(f.name))];
}
