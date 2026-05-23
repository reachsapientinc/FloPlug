/** Firebase Storage prefix for execution hub artifacts (full JSON per run/node). */
export const EXECUTION_HUB_STORAGE_ROOT = 'execution-hub';

export function executionRunStorageRoot(
  hubId: string,
  tenantId: string,
  runId: string,
): string {
  return `${EXECUTION_HUB_STORAGE_ROOT}/${hubId}/${tenantId}/${runId}`;
}

export function executionNodeStoragePath(
  hubId: string,
  tenantId: string,
  runId: string,
  nodeId: string,
): string {
  return `${executionRunStorageRoot(hubId, tenantId, runId)}/nodes/${nodeId}.json`;
}

export function executionRunManifestPath(
  hubId: string,
  tenantId: string,
  runId: string,
): string {
  return `${executionRunStorageRoot(hubId, tenantId, runId)}/manifest.json`;
}
