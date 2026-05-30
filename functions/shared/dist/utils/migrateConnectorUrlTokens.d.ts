/**
 * Pure helpers to migrate legacy connector URL tokens (hostname, path, …)
 * to generic urlToken1, urlToken2, … without recreating connector auth config.
 */
import type { ConnectorUrlToken, ConnectorUrlTokenSource } from './connectorUrlTokens.js';
import { type ConnectionUrlFields, type KitUrlContext } from './connectorUrlTokens.js';
export interface TokenKeyMigration {
    source: ConnectorUrlTokenSource;
    oldKey: string;
    newKey: string;
    oldField?: string;
}
export interface ConnectorUrlMigrationPlan {
    connectorId: string;
    alreadyMigrated: boolean;
    newTokens: ConnectorUrlToken[];
    urlPatternPreview: string;
    keyMigrations: TokenKeyMigration[];
}
export interface MigrationStats {
    connectors: number;
    floKits: number;
    floConnections: number;
    plugs: number;
    floActionNodes: number;
    flos: number;
    floVersions: number;
    skipped: number;
}
export declare function isGenericUrlTokenKey(key: string): boolean;
/** True when every non-static token already uses urlTokenN keys. */
export declare function connectorTokensAlreadyMigrated(tokens?: ConnectorUrlToken[]): boolean;
/** Build migration plan for one connector's urlTokens array. */
export declare function planConnectorUrlTokenMigration(input: {
    connectorId: string;
    urlTokens?: ConnectorUrlToken[];
}): ConnectorUrlMigrationPlan;
/** Remap flat string map (plug/floAction values) for one token source. */
export declare function remapUrlValueMap(values: Record<string, string> | undefined, migrations: TokenKeyMigration[], source: ConnectorUrlTokenSource): Record<string, string>;
/** Remap connectionId → token values maps (hub plug / FloAction admin values). */
export declare function remapUrlValuesByConnection(byConnection: Record<string, Record<string, string>> | undefined, migrations: TokenKeyMigration[], source: ConnectorUrlTokenSource): Record<string, Record<string, string>>;
/** Populate urlTokenValues on a FloConnection from legacy fields + old keys. */
export declare function migrateConnectionUrlValues(conn: ConnectionUrlFields, migrations: TokenKeyMigration[]): Record<string, string>;
/** Populate urlTokenValues on a FloKit from legacy fields + old keys. */
export declare function migrateKitUrlValues(kit: KitUrlContext, migrations: TokenKeyMigration[]): Record<string, string>;
export interface UrlVariableBinding {
    source: string;
    value: string;
}
/** Remap canvas urlVariables / url bindings keyed by token key. */
export declare function remapUrlVariableBindings(bindings: Record<string, UrlVariableBinding> | undefined, migrations: TokenKeyMigration[], sources: ConnectorUrlTokenSource[]): Record<string, UrlVariableBinding>;
export declare function tokenDefsFromConnectorTokens(tokens: ConnectorUrlToken[], source: ConnectorUrlTokenSource): {
    key: string;
    label?: string;
    description?: string;
    field?: string;
}[];
export interface CanvasNodeMigrationInput {
    node: Record<string, unknown>;
    connectorId: string;
    plan: ConnectorUrlMigrationPlan;
    /** plugId → connectorId for plugNode matching */
    plugConnectorById?: Record<string, string>;
}
/** Migrate URL-related fields on a designer canvas node (plugNode / floActionNode). */
export declare function migrateCanvasNodeData(input: CanvasNodeMigrationInput): {
    node: Record<string, unknown>;
    changed: boolean;
};
/** Migrate an array of canvas nodes; returns new array if any node changed. */
export declare function migrateCanvasNodes(nodes: unknown[], input: Omit<CanvasNodeMigrationInput, 'node'>): {
    nodes: unknown[];
    changed: boolean;
    changedCount: number;
};
export declare function emptyMigrationStats(): MigrationStats;
