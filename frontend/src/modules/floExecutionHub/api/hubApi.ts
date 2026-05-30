import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  FloAlertDoc,
  FloExecutionNodeRecord,
  FloExecutionRunSummary,
} from '@floplug/shared';

const fn = () => getFunctions();

export async function listExecutionRuns(
  hubId: string,
  tenantId: string,
  limit = 50,
): Promise<FloExecutionRunSummary[]> {
  const call = httpsCallable<
    { hubId: string; tenantId: string; limit?: number },
    { runs: FloExecutionRunSummary[] }
  >(fn(), 'listFloExecutionRuns');
  const { data } = await call({ hubId, tenantId, limit });
  return data.runs ?? [];
}

export interface ExecutionHubGraph {
  nodes:  { id: string; type?: string; position?: { x: number; y: number }; data?: Record<string, unknown> }[];
  edges:  { id?: string; source: string; target: string }[];
  workspaceId?: string;
}

export interface ExecutionHubRunDetail {
  run: Record<string, unknown> & { id: string; floName?: string };
  nodes: FloExecutionNodeRecord[];
  graph?: ExecutionHubGraph;
}

export async function getExecutionRun(
  hubId: string,
  tenantId: string,
  runId: string,
): Promise<ExecutionHubRunDetail> {
  const call = httpsCallable<
    { hubId: string; tenantId: string; runId: string },
    ExecutionHubRunDetail
  >(fn(), 'getExecutionHubRun');
  const { data } = await call({ hubId, tenantId, runId });
  return data;
}

export async function getExecutionStorageUrls(
  hubId: string,
  tenantId: string,
  runId: string,
): Promise<{
  manifestPath: string;
  manifestUrl: string;
  nodeUrls: { nodeId: string; storagePath: string; url: string }[];
  storageRoot: string;
}> {
  const call = httpsCallable<
    { hubId: string; tenantId: string; runId: string },
    {
      manifestPath: string;
      manifestUrl: string;
      nodeUrls: { nodeId: string; storagePath: string; url: string }[];
      storageRoot: string;
    }
  >(fn(), 'getExecutionHubStorageUrls');
  const { data } = await call({ hubId, tenantId, runId });
  return data;
}

export async function reconcileExecutionRuns(
  hubId: string,
  tenantId: string,
  runId?: string,
): Promise<{ reconciled: string[]; skipped: string[] }> {
  const call = httpsCallable<
    { hubId: string; tenantId: string; runId?: string },
    { reconciled: string[]; skipped: string[] }
  >(fn(), 'reconcileFloRuns');
  const { data } = await call({ hubId, tenantId, runId });
  return data;
}

export async function killExecutionRun(
  hubId: string,
  tenantId: string,
  runId: string,
): Promise<{ ok: boolean; status: string; alreadyTerminal?: boolean }> {
  const call = httpsCallable<
    { hubId: string; tenantId: string; runId: string },
    { ok: boolean; status: string; alreadyTerminal?: boolean }
  >(fn(), 'killFloRun');
  const { data } = await call({ hubId, tenantId, runId });
  return data;
}

export async function listFloAlerts(
  hubId: string,
  tenantId: string,
): Promise<FloAlertDoc[]> {
  const call = httpsCallable<
    { hubId: string; tenantId: string; includeResolved?: boolean },
    { alerts: FloAlertDoc[] }
  >(fn(), 'getFloAlerts');
  const { data } = await call({ hubId, tenantId, includeResolved: false });
  return data.alerts ?? [];
}
