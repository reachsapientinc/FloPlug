import type { ConnectorDoc } from '../types/AuthConnectorTypes.js';
import type { FloKitDoc } from '../types/floKit.js';
import { isFloKitConfigured, resolveKitDataModelSchemaId, resolveKitWsdlSchemaId } from '../types/floKit.js';
import type {
  ConnectorFloKitEntitlements,
  FloKitActionEntitlement,
  FloKitEntitlementRef,
  HubEntitlements,
} from '../types/hubEntitlements.js';
import {
  flattenFloKitEntitlements,
  floKitKey,
  normalizeHubEntitlements,
  resolveEntitledActionIds,
} from './kitEntitlements.js';

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

/** Merge mandatory connectors into the per-connector entitlements map. */
export function normalizeConnectorEntitlements(
  connectors: Record<string, ConnectorFloKitEntitlements>,
  allConnectorIds: string[],
): Record<string, ConnectorFloKitEntitlements> {
  const next: Record<string, ConnectorFloKitEntitlements> = { ...connectors };
  for (const id of allConnectorIds) {
    if (!next[id]) next[id] = { floKits: [] };
  }
  return next;
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
  connectors: Record<string, ConnectorFloKitEntitlements>;
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
    connectors,
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
  const floKitRefs = flattenFloKitEntitlements({
    tierId,
    connectors,
    actionIds: [],
  });

  for (const ref of floKitRefs) {
    const key = floKitKey(ref.connectorId, ref.floKitId);
    if (seenKits.has(key)) {
      return `Duplicate FloKit "${ref.floKitId}" for connector "${ref.connectorId}".`;
    }
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
    if (!isFloKitConfigured(kit)) {
      return `FloKit "${kit.name}" is not fully configured (services schema, data model schema, and actions required).`;
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
  for (const ref of floKitRefs) {
    const kit = floKitsByKey.get(floKitKey(ref.connectorId, ref.floKitId));
    totalActions += resolveEntitledActionIds(ref, kit).length;
  }
  if (totalActions === 0) {
    return 'Select at least one action (via FloKit subscription).';
  }

  for (const connId of connectorIds) {
    if (!connectors[connId]) {
      return `Missing entitlements block for connector "${connId}".`;
    }
  }

  return null;
}

export function buildHubEntitlements(
  tierId: string,
  connectorIds: string[],
  connectors: Record<string, ConnectorFloKitEntitlements>,
  floKitsByKey: Map<string, FloKitDoc>,
): HubEntitlements {
  const actionIdSet = new Set<string>();
  const normalizedConnectors: Record<string, ConnectorFloKitEntitlements> = {};

  for (const connId of connectorIds) {
    const block = connectors[connId] ?? { floKits: [] };
    const normalizedKits: FloKitActionEntitlement[] = [];

    for (const ref of block.floKits) {
      const kit = floKitsByKey.get(floKitKey(connId, ref.floKitId));
      const entitled = resolveEntitledActionIds(ref, kit);
      for (const actionId of entitled) actionIdSet.add(actionId);
      if (entitled.length === 0) continue;

      const all = kit?.actionIds ?? [];
      const isFullKit =
        entitled.length === all.length &&
        all.every(id => entitled.includes(id));

      normalizedKits.push({
        floKitId: ref.floKitId,
        ...(isFullKit ? {} : { actionIds: [...entitled].sort() }),
      });
    }

    normalizedConnectors[connId] = { floKits: normalizedKits };
  }

  return {
    tierId,
    connectors: normalizedConnectors,
    actionIds: [...actionIdSet],
  };
}

/** @deprecated Prefer buildHubEntitlements with connectors map */
export function buildHubEntitlementsFromRefs(
  tierId: string,
  connectorIds: string[],
  floKits: FloKitEntitlementRef[],
  floKitsByKey: Map<string, FloKitDoc>,
): HubEntitlements {
  const connectors: Record<string, ConnectorFloKitEntitlements> = {};
  for (const id of connectorIds) connectors[id] = { floKits: [] };
  for (const ref of floKits) {
    if (!connectors[ref.connectorId]) connectors[ref.connectorId] = { floKits: [] };
    connectors[ref.connectorId].floKits.push({
      floKitId: ref.floKitId,
      ...(ref.actionIds?.length ? { actionIds: ref.actionIds } : {}),
    });
  }
  return buildHubEntitlements(tierId, connectorIds, connectors, floKitsByKey);
}

export {
  floKitKey,
  normalizeHubEntitlements,
  entitledConnectorIds,
  countEntitledFloKits,
} from './kitEntitlements.js';
