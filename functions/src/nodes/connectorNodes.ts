/**
 * functions/src/nodes/connectorNodes.ts
 *
 * Executors for all external connector nodes:
 *   workdayNode, salesforceNode, sapNode, oracleNode
 *
 * Each executor currently uses mock data while real API integration
 * is pending. The credential check is real — if creds are missing
 * the node throws and the flow logs an error.
 *
 * When you implement real connectors, replace the mock block in each
 * executor with the actual API call. The credential fetch, error
 * handling, and cStream merge pattern stay the same.
 *
 * getConnectorCreds is injected rather than imported directly so
 * each node file stays free of firebase-admin dependencies and is
 * independently testable.
 */

import type { NodeResult, NodeStore } from '@floplug/shared';

// ── Credential injector type ──────────────────────────────────────────────────
// Passed in from index.ts so connector nodes don't import firebase-admin directly.
export type CredsFetcher = (
  hubId:       string,
  tenantId:    string,
  connectorId: string,
) => Promise<Record<string, string> | null>;

// ── Workday ───────────────────────────────────────────────────────────────────

export async function executeWorkdayNode(
  cStream:      unknown,
  nd:           Record<string, any>,
  _store:       NodeStore,
  fetchCreds:   CredsFetcher,
): Promise<NodeResult> {
  const { hubId, tenantId } = nd;
  const creds = await fetchCreds(hubId, tenantId, 'workday');
  if (!creds) throw new Error('Workday credentials not configured');

  const actionType = String(nd.actionType ?? '');
  const refId      = String(nd.refId      ?? '');
  const refIdType  = String(nd.refIdType  ?? '');

  // ── Mock responses — replace with real Workday API calls ─────────────────
  const mocks: Record<string, unknown> = {
    Get_Suppliers:         { refId, refIdType, name: 'Acme Corp',    title: 'Supplier',    status: 'Active' },
    Get_Customers:         { refId, refIdType, hours: 160,           period: 'Q1-2026',    approved: true },
    Get_Sales_Items:       { refId, refIdType, grossPay: 8500,       currency: 'USD',      period: '2026-03' },
    Get_Supplier_Invoices: { refId, refIdType, medical: true,        dental: true,         vision: false },
    Get_Workers:           { workers: [{ refId, refIdType, name: 'John Doe' }], total: 1 },
  };

  const data   = mocks[actionType] ?? {};
  const result = { ...(cStream as object), ...data };

  return { cStream: result, logLine: `✓ Workday ${actionType || '(no action)'}` };
}

// ── Salesforce ────────────────────────────────────────────────────────────────

export async function executeSalesforceNode(
  cStream:    unknown,
  nd:         Record<string, any>,
  _store:     NodeStore,
  fetchCreds: CredsFetcher,
): Promise<NodeResult> {
  const { hubId, tenantId } = nd;
  const creds = await fetchCreds(hubId, tenantId, 'salesforce');
  if (!creds) throw new Error('Salesforce credentials not configured');

  const sfObject  = String(nd.sfObject  ?? '');
  const operation = String(nd.operation ?? '');

  // ── Mock — replace with real Salesforce API call ──────────────────────────
  const result = {
    ...(cStream as object),
    sfObject,
    operation,
    recordsAffected: 1,
  };

  return { cStream: result, logLine: `✓ Salesforce ${operation} on ${sfObject}` };
}

// ── SAP ───────────────────────────────────────────────────────────────────────

export async function executeSapNode(
  cStream:    unknown,
  nd:         Record<string, any>,
  _store:     NodeStore,
  fetchCreds: CredsFetcher,
): Promise<NodeResult> {
  const { hubId, tenantId } = nd;
  const creds = await fetchCreds(hubId, tenantId, 'sap');
  if (!creds) throw new Error('SAP credentials not configured');

  const sapModule = String(nd.sapModule ?? '');
  const bapi      = String(nd.bapi      ?? '');
  const action    = String(nd.action    ?? '');

  // ── Mock — replace with real SAP BAPI/RFC call ────────────────────────────
  const result = {
    ...(cStream as object),
    module:  sapModule,
    bapi,
    success: true,
  };

  return { cStream: result, logLine: `✓ SAP ${action} on ${sapModule}/${bapi}` };
}

// ── Oracle ────────────────────────────────────────────────────────────────────

export async function executeOracleNode(
  cStream:    unknown,
  nd:         Record<string, any>,
  _store:     NodeStore,
  fetchCreds: CredsFetcher,
): Promise<NodeResult> {
  const { hubId, tenantId } = nd;
  const creds = await fetchCreds(hubId, tenantId, 'oracle');
  if (!creds) throw new Error('Oracle credentials not configured');

  const action    = String(nd.action    ?? '');
  const sqlOrProc = String(nd.sqlOrProc ?? '');

  // ── Mock — replace with real Oracle DB/API call ───────────────────────────
  const result = {
    ...(cStream as object),
    action,
    sqlOrProc,
    rowsAffected: 5,
  };

  return { cStream: result, logLine: `✓ Oracle ${action}` };
}
