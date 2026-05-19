/**
 * Shared connector / FloKit / action entitlement picker.
 * FloKits load when connectors are chosen; actions load per kit on expand only.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { loadConnectors } from '../types/AuthConnectorTypes';
import type { ConnectorDoc, FloKitDoc, ActionDoc } from '@floplug/shared';
import {
  COLLECTIONS, SUB_COLLECTIONS,
  filterConnectorsForTier, filterFloKitsForTier, countTierControlledConnectors,
  standardConnectorIds, normalizeConnectorIds,
  floKitKey, kitCheckState, isFloKitConfigured, type KitActionSelectionMap,
} from '@floplug/shared';

export function connIdsKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

async function fetchKitActions(
  connectorId: string,
  floKitId: string,
  actionIds: string[],
): Promise<ActionDoc[]> {
  if (actionIds.length === 0) return [];
  const loadOne = async (id: string): Promise<ActionDoc | null> => {
    const kitRef = doc(
      db,
      COLLECTIONS.FLOPLUGCONNECTORS, connectorId,
      SUB_COLLECTIONS.FLOKITS, floKitId,
      SUB_COLLECTIONS.FLOKITACTIONS, id,
    );
    const kitSnap = await getDoc(kitRef);
    if (kitSnap.exists()) {
      return { id: kitSnap.id, ...kitSnap.data(), floKitId } as ActionDoc;
    }
    const legacyRef = doc(
      db, COLLECTIONS.FLOPLUGCONNECTORS, connectorId, SUB_COLLECTIONS.ACTIONS, id,
    );
    const legacySnap = await getDoc(legacyRef);
    if (!legacySnap.exists()) return null;
    return { id: legacySnap.id, ...legacySnap.data(), floKitId } as ActionDoc;
  };
  const results = await Promise.all(actionIds.map(loadOne));
  return results.filter((a): a is ActionDoc => !!a && a.isActive !== false);
}

export function useEntitlementCatalog(tierId: string) {
  const [connectors, setConnectors] = useState<ConnectorDoc[]>([]);
  const [floKitsByConn, setFloKitsByConn] = useState<Record<string, FloKitDoc[]>>({});
  const [kitActionsByKey, setKitActionsByKey] = useState<Record<string, ActionDoc[]>>({});
  const [kitActionsLoading, setKitActionsLoading] = useState<Record<string, boolean>>({});
  const [maxTierControlled, setMaxTierControlled] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [kitsLoading, setKitsLoading] = useState(false);
  const lastKitsLoadKey = useRef('');
  const kitActionsCacheRef = useRef<Record<string, ActionDoc[]>>({});
  const kitActionsInflightRef = useRef<Set<string>>(new Set());

  const eligibleConnectors = useMemo(
    () => filterConnectorsForTier(connectors, tierId),
    [connectors, tierId],
  );
  const connectorsById = useMemo(
    () => new Map(connectors.map(c => [c.id, c])),
    [connectors],
  );

  const floKitsByKey = useMemo(() => {
    const map = new Map<string, FloKitDoc>();
    for (const [connId, kits] of Object.entries(floKitsByConn)) {
      for (const kit of kits) map.set(floKitKey(connId, kit.id), kit);
    }
    return map;
  }, [floKitsByConn]);

  const loadFloKitsForConnectors = useCallback(async (connIds: string[]) => {
    const key = connIdsKey(connIds);
    if (connIds.length === 0) {
      lastKitsLoadKey.current = '';
      setFloKitsByConn({});
      kitActionsCacheRef.current = {};
      setKitActionsByKey({});
      setKitActionsLoading({});
      kitActionsInflightRef.current.clear();
      return;
    }
    if (key === lastKitsLoadKey.current) return;

    lastKitsLoadKey.current = key;
    setKitsLoading(true);
    try {
      const entries = await Promise.all(
        connIds.map(async connId => {
          const kitSnap = await getDocs(
            collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.FLOKITS),
          );
          const kits = kitSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as FloKitDoc))
            .filter(k => k.isActive !== false && isFloKitConfigured(k));
          return [connId, filterFloKitsForTier(kits, tierId)] as const;
        }),
      );
      setFloKitsByConn(Object.fromEntries(entries));
      kitActionsCacheRef.current = {};
      setKitActionsByKey({});
      setKitActionsLoading({});
      kitActionsInflightRef.current.clear();
    } finally {
      setKitsLoading(false);
    }
  }, [tierId]);

  const loadKitActions = useCallback(async (connectorId: string, kit: FloKitDoc) => {
    const key = floKitKey(connectorId, kit.id);
    if (kitActionsCacheRef.current[key]) return kitActionsCacheRef.current[key];
    if (kitActionsInflightRef.current.has(key)) return [];

    kitActionsInflightRef.current.add(key);
    setKitActionsLoading(prev => ({ ...prev, [key]: true }));
    try {
      const actions = await fetchKitActions(connectorId, kit.id, kit.actionIds ?? []);
      kitActionsCacheRef.current = { ...kitActionsCacheRef.current, [key]: actions };
      setKitActionsByKey(kitActionsCacheRef.current);
      return actions;
    } catch {
      kitActionsCacheRef.current = { ...kitActionsCacheRef.current, [key]: [] };
      setKitActionsByKey(kitActionsCacheRef.current);
      return [];
    } finally {
      kitActionsInflightRef.current.delete(key);
      setKitActionsLoading(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    lastKitsLoadKey.current = '';
    
    (async () => {

      if (!tierId || tierId === "" || tierId === "loading_placeholder" || tierId === "unassigned_fallback") {
      setCatalogLoading(false);
      setKitsLoading(false);
      return;
    }
      setCatalogLoading(true);
      try {
        const [conns, tierSnap] = await Promise.all([
          loadConnectors(),
          getDoc(doc(db, COLLECTIONS.FLOPLUGTIERS, tierId)),
        ]);
        if (!cancelled) {
          setConnectors(conns);
          setMaxTierControlled((tierSnap.data()?.inclConnectors as number) ?? 0);
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tierId]);

  return {
    connectors,
    eligibleConnectors,
    connectorsById,
    floKitsByConn,
    floKitsByKey,
    kitActionsByKey,
    kitActionsLoading,
    maxTierControlled,
    catalogLoading,
    kitsLoading,
    loadFloKitsForConnectors,
    loadKitActions,
    standardIds: () => standardConnectorIds(connectors, tierId),
    normalizeIds: (ids: string[]) => normalizeConnectorIds(ids, connectors, tierId),
  };
}

interface KitRowProps {
  connectorId: string;
  kit: FloKitDoc;
  actions: ActionDoc[];
  actionsLoading: boolean;
  selectedActionIds: string[];
  expanded: boolean;
  onToggleExpand: () => void;
  onChangeSelection: (actionIds: string[]) => void;
  onLoadActions: () => Promise<ActionDoc[]>;
  styles: Record<string, React.CSSProperties>;
}

const KitRow: React.FC<KitRowProps> = ({
  connectorId: _connectorId,
  kit,
  actions,
  actionsLoading,
  selectedActionIds,
  expanded,
  onToggleExpand,
  onChangeSelection,
  onLoadActions,
  styles: s,
}) => {
  const kitCheckboxRef = useRef<HTMLInputElement>(null);

  const enabledActions = useMemo(() => {
    const byId = new Map(actions.map(a => [a.id, a]));
    return (kit.actionIds ?? [])
      .map(id => byId.get(id))
      .filter((a): a is ActionDoc => !!a);
  }, [actions, kit.actionIds]);

  const enabledIds = useMemo(() => enabledActions.map(a => a.id), [enabledActions]);
  const check = kitCheckState(
    selectedActionIds,
    enabledIds.length > 0 ? enabledIds : (kit.actionIds ?? []),
  );

  const onLoadRef = useRef(onLoadActions);
  onLoadRef.current = onLoadActions;
  useEffect(() => {
    if (expanded) onLoadRef.current();
  }, [expanded]);

  useEffect(() => {
    if (kitCheckboxRef.current) {
      kitCheckboxRef.current.indeterminate = check === 'partial';
    }
  }, [check]);

  const toggleKit = () => {
    if (check === 'all') {
      onChangeSelection([]);
      return;
    }
    if (enabledIds.length > 0) {
      onChangeSelection([...enabledIds]);
      return;
    }
    void onLoadActions().then(loaded => {
      const ids = loaded.map(a => a.id);
      if (ids.length > 0) onChangeSelection(ids);
    });
  };

  const toggleAction = (actionId: string) => {
    if (selectedActionIds.includes(actionId)) {
      onChangeSelection(selectedActionIds.filter(id => id !== actionId));
    } else {
      onChangeSelection([...selectedActionIds, actionId]);
    }
  };

  return (
    <div style={s.kitBlock}>
      <div style={s.kitHeader}>
        <button type="button" onClick={onToggleExpand} style={s.expandBtn} aria-expanded={expanded}>
          {expanded ? '▾' : '▸'}
        </button>
        <input
          ref={kitCheckboxRef}
          type="checkbox"
          checked={check === 'all'}
          onChange={toggleKit}
        />
        <button type="button" onClick={onToggleExpand} style={s.kitTitleBtn}>
          <span style={{ fontWeight: 500 }}>{kit.name}</span>
          <span style={{ color: '#45455a', marginLeft: 6, fontSize: 10 }}>
            v{kit.kitVersion} · {selectedActionIds.length}/{enabledIds.length || (kit.actionIds?.length ?? 0)} actions
          </span>
        </button>
        {check === 'partial' && <span style={s.partialBadge}>partial</span>}
      </div>

      {expanded && (
        <div style={s.kitActionsPanel}>
          {actionsLoading ? (
            <p style={{ fontSize: 11, color: '#6b6b80', margin: 0 }}>Loading actions for this kit…</p>
          ) : enabledActions.length === 0 ? (
            <p style={{ fontSize: 11, color: '#6b6b80', margin: 0 }}>No enabled actions in this kit.</p>
          ) : (
            enabledActions.map(action => (
              <label key={action.id} style={s.checkRow}>
                <input
                  type="checkbox"
                  checked={selectedActionIds.includes(action.id)}
                  onChange={() => toggleAction(action.id)}
                />
                <span style={{ flex: 1, fontSize: 11 }}>{action.label}</span>
                {action.method && (
                  <span style={{ fontSize: 9, color: '#45455a', fontFamily: 'monospace' }}>
                    {action.method}
                  </span>
                )}
              </label>
            ))
          )}
          {!actionsLoading && enabledActions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" style={s.linkBtn} onClick={() => onChangeSelection([...enabledIds])}>
                Select all
              </button>
              <button type="button" style={s.linkBtn} onClick={() => onChangeSelection([])}>
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface EntitlementsSectionProps {
  eligibleConnectors: ConnectorDoc[];
  connectorsById: Map<string, ConnectorDoc>;
  catalogLoading: boolean;
  kitsLoading: boolean;
  floKitsByConn: Record<string, FloKitDoc[]>;
  kitActionsByKey: Record<string, ActionDoc[]>;
  kitActionsLoading: Record<string, boolean>;
  selectedConnIds: string[];
  kitSelections: KitActionSelectionMap;
  onKitSelectionsChange: (next: KitActionSelectionMap) => void;
  maxTierControlled: number;
  onToggleConnector: (connId: string) => void;
  onLoadKitActions: (connectorId: string, kit: FloKitDoc) => Promise<ActionDoc[]>;
  styles: Record<string, React.CSSProperties>;
}

export const EntitlementsSection: React.FC<EntitlementsSectionProps> = ({
  eligibleConnectors,
  connectorsById,
  catalogLoading,
  kitsLoading,
  floKitsByConn,
  kitActionsByKey,
  kitActionsLoading,
  selectedConnIds,
  kitSelections,
  onKitSelectionsChange,
  maxTierControlled,
  onToggleConnector,
  onLoadKitActions,
  styles: s,
}) => {
  const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());
  const tierControlledSelected = countTierControlledConnectors(selectedConnIds, connectorsById);

  const setKitSelection = (key: string, actionIds: string[]) => {
    const next = { ...kitSelections };
    if (actionIds.length === 0) delete next[key];
    else next[key] = actionIds;
    onKitSelectionsChange(next);
  };

  const toggleExpand = (key: string) => {
    setExpandedKits(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  return (
    <>
      <div style={{ ...s.fg, gridColumn: '1/-1' }}>
        <label style={s.fl}>Entitled Connectors *</label>
        {catalogLoading ? (
          <p style={{ fontSize: 11, color: '#6b6b80', margin: 0 }}>Loading connectors…</p>
        ) : eligibleConnectors.length === 0 ? (
          <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>No connectors available for this tier.</p>
        ) : (
          <div style={s.checkList}>
            {eligibleConnectors.map(c => {
              const isStandard = !c.tierControlled;
              return (
                <label
                  key={c.id}
                  style={{ ...s.checkRow, ...(isStandard ? s.checkRowLocked : {}) }}
                >
                  <input
                    type="checkbox"
                    checked={selectedConnIds.includes(c.id)}
                    disabled={isStandard}
                    onChange={() => !isStandard && onToggleConnector(c.id)}
                  />
                  <span style={{ flex: 1 }}>
                    {c.label}
                    {isStandard ? (
                      <span style={s.standardBadge}>included</span>
                    ) : (
                      <span style={s.tierBadge}>tier-controlled</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {maxTierControlled > 0 && (
          <p style={{
            fontSize: 10,
            color: tierControlledSelected > maxTierControlled ? '#f87171' : '#6b6b80',
            marginTop: 6,
            marginBottom: 0,
          }}>
            Tier-controlled: {tierControlledSelected} / {maxTierControlled} max
          </p>
        )}
      </div>

      <div style={{ ...s.fg, gridColumn: '1/-1' }}>
        <label style={s.fl}>FloKits &amp; Actions *</label>
        <p style={{ fontSize: 10, color: '#45455a', margin: '0 0 8px' }}>
          Expand a kit to load and pick its enabled actions. Use the kit checkbox to select all loaded actions.
        </p>
        {selectedConnIds.length === 0 ? (
          <p style={{ fontSize: 11, color: '#6b6b80', margin: 0 }}>Select connectors first.</p>
        ) : kitsLoading ? (
          <p style={{ fontSize: 11, color: '#6b6b80', margin: 0 }}>Loading FloKits…</p>
        ) : (
          <div style={s.kitList}>
            {selectedConnIds.map(connId => {
              const conn = connectorsById.get(connId);
              const kits = floKitsByConn[connId] ?? [];
              if (kits.length === 0) {
                return (
                  <p key={connId} style={{ fontSize: 11, color: '#6b6b80', margin: '4px 0' }}>
                    {conn?.label ?? connId}: no FloKits for this tier
                  </p>
                );
              }
              return (
                <div key={connId} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#9090a0', marginBottom: 6, textTransform: 'uppercase' }}>
                    {conn?.label ?? connId}
                  </div>
                  {kits.map(kit => {
                    const key = floKitKey(connId, kit.id);
                    return (
                      <KitRow
                        key={key}
                        connectorId={connId}
                        kit={kit}
                        actions={kitActionsByKey[key] ?? []}
                        actionsLoading={!!kitActionsLoading[key]}
                        selectedActionIds={kitSelections[key] ?? []}
                        expanded={expandedKits.has(key)}
                        onToggleExpand={() => toggleExpand(key)}
                        onChangeSelection={ids => setKitSelection(key, ids)}
                        onLoadActions={() => onLoadKitActions(connId, kit)}
                        styles={s}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
