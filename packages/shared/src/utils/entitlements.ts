import type { ConnectorDoc } from '../types/AuthConnectorTypes.js';
import type { FloKitDoc } from '../types/floKit.js';
import type { FloKitEntitlementRef, HubEntitlements } from '../types/hubEntitlements.js';
import { floKitKey, resolveEntitledActionIds } from './kitEntitlements.js';

export function connectorAvailableForTier(
  connector: ConnectorDoc,
  tierId: string,
): boolean {
  if (connector.isActive === false) return false;
  if (!connector.tierControlled) return true;
  const tiers = connector.availableForTiers ?? [];
  return tiers.length === 0 || tiers.includes(tierId);
}

export function floKitAvailableForTier(kit: FloKitDoc, tierId: string): boolean {
  if (kit.isActive === false) return false;
  const tiers = kit.availableForTiers ?? [];
  return tiers.length === 0 || tiers.includes(tierId);
}

export function filterConnectorsForTier(
  connectors: ConnectorDoc[],
  tierId: string,
): ConnectorDoc[] {
  return connectors.filter(c => connectorAvailableForTier(c, tierId));
}

/** Non–tier-controlled connectors always entitled for a hub on this tier. */
export function standardConnectorIds(
  connectors: ConnectorDoc[],
  tierId: string,
): string[] {
  return filterConnectorsForTier(connectors, tierId)
    .filter(c => !c.tierControlled)
    .map(c => c.id);
}

/** Ensures standard connectors are always included in the selection. */
export function normalizeConnectorIds(
  connectorIds: string[],
  connectors: ConnectorDoc[],
  tierId: string,
): string[] {
  const mandatory = standardConnectorIds(connectors, tierId);
  return [...new Set([...mandatory, ...connectorIds])];
}

export function filterFloKitsForTier(kits: FloKitDoc[], tierId: string): FloKitDoc[] {
  return kits.filter(k => floKitAvailableForTier(k, tierId));
}

export function countTierControlledConnectors(
  connectorIds: string[],
  connectorsById: Map<string, ConnectorDoc>,
): number {
  return connectorIds.filter(id => connectorsById.get(id)?.tierControlled).length;
}

export interface ValidateProvisionEntitlementsInput {
  tierId: string;
  connectorIds: string[];
  floKits: FloKitEntitlementRef[];
  connectorsById: Map<string, ConnectorDoc>;
  floKitsByKey: Map<string, FloKitDoc>;
  maxTierControlledConnectors: number;
}

/** Returns an error message or null if valid. */
export function validateProvisionEntitlements(
  input: ValidateProvisionEntitlementsInput,
): string | null {
  const {
    tierId,
    connectorIds,
    floKits,
    connectorsById,
    floKitsByKey,
    maxTierControlledConnectors,
  } = input;

  if (connectorIds.length === 0) {
    return 'Select at least one connector for this hub.';
  }

  const seenConnectors = new Set<string>();
  for (const id of connectorIds) {
    if (seenConnectors.has(id)) return `Duplicate connector "${id}".`;
    seenConnectors.add(id);

    const connector = connectorsById.get(id);
    if (!connector) return `Connector "${id}" not found.`;
    if (!connectorAvailableForTier(connector, tierId)) {
      return `Connector "${connector.label}" is not available for tier "${tierId}".`;
    }
  }

  const tierControlledCount = countTierControlledConnectors(connectorIds, connectorsById);
  if (
    maxTierControlledConnectors > 0 &&
    tierControlledCount > maxTierControlledConnectors
  ) {
    return `This tier allows at most ${maxTierControlledConnectors} tier-controlled connector(s); you selected ${tierControlledCount}.`;
  }

  const entitledConnectorIds = new Set(connectorIds);
  const seenKits = new Set<string>();

  for (const ref of floKits) {
    const key = floKitKey(ref.connectorId, ref.floKitId);
    if (seenKits.has(key)) return `Duplicate FloKit "${ref.floKitId}" for connector "${ref.connectorId}".`;
    seenKits.add(key);

    if (!entitledConnectorIds.has(ref.connectorId)) {
      return `FloKit "${ref.floKitId}" requires connector "${ref.connectorId}" to be entitled first.`;
    }

    const kit = floKitsByKey.get(key);
    if (!kit) {
      return `FloKit "${ref.floKitId}" not found under connector "${ref.connectorId}".`;
    }
    if (!floKitAvailableForTier(kit, tierId)) {
      return `FloKit "${kit.name}" is not available for tier "${tierId}".`;
    }
    if (!kit.schemaId?.trim() || !(kit.actionIds?.length)) {
      return `FloKit "${kit.name}" is not fully configured (schema and actions required).`;
    }

    const entitled = resolveEntitledActionIds(ref, kit);
    if (entitled.length === 0) {
      return `FloKit "${kit.name}" must include at least one action.`;
    }
    if (entitled.length > (kit.actionIds?.length ?? 0)) {
      return `FloKit "${kit.name}" has invalid action references.`;
    }
  }

  let totalActions = 0;
  for (const ref of floKits) {
    const kit = floKitsByKey.get(floKitKey(ref.connectorId, ref.floKitId));
    totalActions += resolveEntitledActionIds(ref, kit).length;
  }
  if (totalActions === 0) {
    return 'Select at least one action (via FloKit subscription).';
  }

  return null;
}

export function buildHubEntitlements(
  tierId: string,
  connectorIds: string[],
  floKits: FloKitEntitlementRef[],
  floKitsByKey: Map<string, FloKitDoc>,
): HubEntitlements {
  const actionIdSet = new Set<string>();
  const normalizedKits: FloKitEntitlementRef[] = [];

  for (const ref of floKits) {
    const kit = floKitsByKey.get(floKitKey(ref.connectorId, ref.floKitId));
    const entitled = resolveEntitledActionIds(ref, kit);
    for (const actionId of entitled) actionIdSet.add(actionId);
    if (entitled.length === 0) continue;

    const all = kit?.actionIds ?? [];
    const isFullKit =
      entitled.length === all.length &&
      all.every(id => entitled.includes(id));

    normalizedKits.push({
      connectorId: ref.connectorId,
      floKitId:    ref.floKitId,
      ...(isFullKit ? {} : { actionIds: [...entitled].sort() }),
    });
  }

  return {
    tierId,
    connectorIds: [...connectorIds],
    floKits:       normalizedKits,
    actionIds:     [...actionIdSet],
  };
}

export { floKitKey } from './kitEntitlements.js';
