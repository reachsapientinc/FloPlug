/**
 * Runtime resolution for floActionNode — merges persisted canvas picks with
 * hub FloActionNodes registry defaults (connectorId is hub-managed, not saved on flo).
 */
import type { HubActionNodeDoc } from '../types/actionNode.js';
export declare function hubFloActionNodeDocId(floKitId: string): string;
export interface FloActionRuntimeFields {
    floKitId: string;
    actionId: string;
    connectorId: string;
    connectionId: string;
}
type HubLike = Pick<HubActionNodeDoc, 'floKitId' | 'connectorId' | 'actionIds' | 'templateActionId' | 'defaultConnectionId' | 'allowedConnectionIds'>;
/** Merge canvas node.data with hub FloActionNodes doc — canvas picks win when set. */
export declare function mergeFloActionRuntimeFields(canvas: Record<string, unknown>, hub?: HubLike | Record<string, unknown> | null): FloActionRuntimeFields;
export {};
