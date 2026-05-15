export type PlugCredentialValues = Record<string, string>;
export interface PlugVariableHint {
    name: string;
    hint: string;
    defaultValue?: string;
}
export interface PlugVariableBinding {
    source: 'static' | 'cStream' | 'global' | 'local';
    value: string;
}
export interface PlugConfig {
    id: string;
    hubId: string;
    tenantId: string;
    connectorId: string;
    connectorLabel: string;
    authProtocol: string;
    nodeType?: string;
    name: string;
    urlPattern: string;
    variableHints: PlugVariableHint[];
    credentials: PlugCredentialValues;
    urlVariables?: Record<string, PlugVariableBinding>;
    isActive: boolean;
    createdBy: string;
    updatedBy: string;
    createdAt?: any;
    updatedAt?: any;
}
export interface RunContext {
    hubId: string;
    tenantId: string;
    wsId: string;
    runId: string;
    store: {
        global: Record<string, any>;
        local: Record<string, any>;
    };
    log: string[];
    depth: number;
}
