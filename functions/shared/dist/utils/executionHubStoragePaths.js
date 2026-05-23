/** Firebase Storage prefix for execution hub artifacts (full JSON per run/node). */
export const EXECUTION_HUB_STORAGE_ROOT = 'execution-hub';
export function executionRunStorageRoot(hubId, tenantId, runId) {
    return `${EXECUTION_HUB_STORAGE_ROOT}/${hubId}/${tenantId}/${runId}`;
}
export function executionNodeStoragePath(hubId, tenantId, runId, nodeId) {
    return `${executionRunStorageRoot(hubId, tenantId, runId)}/nodes/${nodeId}.json`;
}
export function executionRunManifestPath(hubId, tenantId, runId) {
    return `${executionRunStorageRoot(hubId, tenantId, runId)}/manifest.json`;
}
