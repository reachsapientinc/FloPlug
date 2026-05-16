import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type { Node } from '@xyflow/react';

export async function testConnectorNode(
  functions: Functions,
  hubId: string,
  tenantId: string,
  node: Node,
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void,
): Promise<boolean> {
  const d = node.data as Record<string, unknown>;
  const base = { hubId, tenantId };

  const runners: Record<string, { fn: string; payload: Record<string, unknown> }> = {
    workdayNode: {
      fn: 'executeWorkdayAction',
      payload: { refId: d.refId, refIdType: d.refIdType, actionType: d.actionType },
    },
    salesforceNode: {
      fn: 'executeSalesforceAction',
      payload: { sfObject: d.sfObject, operation: d.operation, filter: d.filter },
    },
    sapNode: {
      fn: 'executeSapAction',
      payload: { sapModule: d.sapModule, action: d.action, bapi: d.bapi },
    },
    oracleNode: {
      fn: 'executeOracleAction',
      payload: { action: d.action, sqlOrProc: d.sqlOrProc },
    },
  };

  const spec = runners[node.type ?? ''];
  if (!spec) return false;

  onUpdate(node.id, { _loading: true, _result: 'Running…', _isError: false });
  try {
    const fn = httpsCallable(functions, spec.fn);
    const res: any = await fn({ ...spec.payload, ...base });
    onUpdate(node.id, {
      _loading: false,
      _result: `✓ ${res.data?.message ?? res.data?.data?.message ?? 'Done'}`,
      _isError: false,
    });
  } catch (err: any) {
    onUpdate(node.id, {
      _loading: false,
      _result: err.message ?? String(err),
      _isError: true,
    });
  }
  return true;
}
