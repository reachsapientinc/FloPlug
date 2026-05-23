/** Firebase Storage prefix for execution hub artifacts (full JSON per run/node). */
export declare const EXECUTION_HUB_STORAGE_ROOT = "execution-hub";
export declare function executionRunStorageRoot(hubId: string, tenantId: string, runId: string): string;
export declare function executionNodeStoragePath(hubId: string, tenantId: string, runId: string, nodeId: string): string;
export declare function executionRunManifestPath(hubId: string, tenantId: string, runId: string): string;
