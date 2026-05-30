/**
 * Runtime resolution for floActionNode — merges persisted canvas picks with
 * hub FloActionNodes registry defaults (connectorId is hub-managed, not saved on flo).
 */

import type { HubActionNodeDoc } from '../types/actionNode.js';

export function hubFloActionNodeDocId(floKitId: string): string {
  return `flan_${floKitId}`;
}

export interface FloActionRuntimeFields {
  floKitId:     string;
  actionId:     string;
  connectorId:  string;
  connectionId: string;
}

type HubLike = Pick<
  HubActionNodeDoc,
  'floKitId' | 'connectorId' | 'actionIds' | 'templateActionId' | 'defaultConnectionId' | 'allowedConnectionIds'
>;

/** Merge canvas node.data with hub FloActionNodes doc — canvas picks win when set. */
export function mergeFloActionRuntimeFields(
  canvas: Record<string, unknown>,
  hub?: HubLike | Record<string, unknown> | null,
): FloActionRuntimeFields {
  const floKitId = String(canvas.floKitId ?? hub?.floKitId ?? '');
  const hubDoc = hub as HubLike | undefined;

  const actionIds = hubDoc?.actionIds?.length
    ? hubDoc.actionIds
    : hubDoc?.templateActionId
      ? [hubDoc.templateActionId]
      : [];

  const allowedConnections = hubDoc?.allowedConnectionIds ?? [];

  return {
    floKitId,
    actionId: String(
      canvas.actionId || hubDoc?.templateActionId || actionIds[0] || '',
    ),
    connectorId: String(
      canvas.connectorId || hubDoc?.connectorId || '',
    ),
    connectionId: String(
      canvas.connectionId || hubDoc?.defaultConnectionId || allowedConnections[0] || '',
    ),
  };
}
