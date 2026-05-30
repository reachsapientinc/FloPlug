/**
 * FloSwitch inspector — branches, conditions, route picker, expand/collapse, reorder.
 */

import React, { useCallback, useMemo } from 'react';
import {
  createSwitchBranch,
  sortSwitchBranches,
  SWITCH_DEFAULT_HANDLE,
  type SwitchBranch,
} from '@floplug/shared';
import type { NodeInspectorProps } from './types';
import { Field, Inp, Sel, Btn } from './ui';
import { ConditionRowsEditor } from './ConditionRowsEditor';
import { IconAdd, IconChevron, IconDelete, IconDrag, IconRoute } from './icons';

function normalizeOrders(branches: SwitchBranch[]): SwitchBranch[] {
  return sortSwitchBranches(branches).map((b, i) => ({ ...b, order: i }));
}

export const SwitchInspectorCore: React.FC<NodeInspectorProps> = ({ node, onUpdate }) => {
  const d = node.data as Record<string, unknown>;
  const branches = useMemo(
    () => normalizeOrders((d.branches as SwitchBranch[]) ?? []),
    [d.branches],
  );
  const activeId = String(d.activeBranchId ?? branches[0]?.id ?? '');

  const setBranches = useCallback((next: SwitchBranch[], activeBranchId?: string) => {
    onUpdate(node.id, {
      branches: normalizeOrders(next),
      ...(activeBranchId != null ? { activeBranchId } : {}),
    });
  }, [node.id, onUpdate]);

  const activeBranch = branches.find(b => b.id === activeId) ?? branches[0];

  const addBranch = () => {
    const br = createSwitchBranch(`Route ${branches.length + 1}`);
    br.order = branches.length;
    setBranches([...branches, br], br.id);
  };

  const removeBranch = (id: string) => {
    if (branches.length <= 1) return;
    const next = branches.filter(b => b.id !== id);
    const nextActive = activeId === id ? next[0]?.id : activeId;
    setBranches(next, nextActive);
  };

  const patchBranch = (id: string, patch: Partial<SwitchBranch>) => {
    setBranches(branches.map(b => (b.id === id ? { ...b, ...patch } : b)));
  };

  const moveBranch = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= branches.length) return;
    const copy = [...branches];
    const [item] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, item);
    setBranches(copy);
  };

  const dragRef = React.useRef<{ id: string; idx: number } | null>(null);

  return (
    <>
      <Field label="Edit route">
        <Sel
          value={activeId}
          onChange={e => onUpdate(node.id, { activeBranchId: e.target.value })}
        >
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.label || b.id}</option>
          ))}
          <option value={SWITCH_DEFAULT_HANDLE}>defaultFlo (no match)</option>
        </Sel>
      </Field>

      <div style={{ marginBottom: 10 }}>
        <Btn variant="primary" fullWidth onClick={addBranch}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <IconAdd color="#fff" /> Add switch route
          </span>
        </Btn>
      </div>

      {activeId === SWITCH_DEFAULT_HANDLE ? (
        <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.5 }}>
          <IconRoute /> Default path runs when no route matches. Connect the dashed <strong>defaultFlo</strong> handle on the canvas.
        </div>
      ) : activeBranch && (
        <div style={{ marginBottom: 12 }}>
          <Field label="Route label">
            <Inp
              value={activeBranch.label}
              onChange={e => patchBranch(activeBranch.id, { label: e.target.value })}
            />
          </Field>
          <ConditionRowsEditor
            rows={activeBranch.conditionRows ?? []}
            onChange={conditionRows => patchBranch(activeBranch.id, { conditionRows })}
          />
        </div>
      )}

      <div style={{ fontSize: 9, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
        All routes (drag to reorder)
      </div>

      {branches.map((br, idx) => {
        const isActive = br.id === activeId;
        const collapsed = isActive ? false : (br.collapsed ?? true);
        return (
          <div
            key={br.id}
            draggable
            onDragStart={() => { dragRef.current = { id: br.id, idx }; }}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              const from = dragRef.current;
              if (!from || from.id === br.id) return;
              moveBranch(from.idx, idx);
              dragRef.current = null;
            }}
            style={{
              marginBottom: 6,
              border: `0.5px solid ${isActive ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 6,
              background: isActive ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px',
              cursor: 'pointer',
            }}>
              <span style={{ cursor: 'grab', opacity: 0.6 }} title="Drag to reorder">
                <IconDrag />
              </span>
              <button
                type="button"
                onClick={() => patchBranch(br.id, { collapsed: !collapsed })}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9ca3af' }}
              >
                <IconChevron open={!collapsed} />
              </button>
              <button
                type="button"
                onClick={() => onUpdate(node.id, { activeBranchId: br.id })}
                style={{
                  flex: 1, textAlign: 'left', background: 'none', border: 'none',
                  color: '#e8e8f0', fontSize: 10, fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                }}
              >
                {idx + 1}. {br.label || 'Route'}
              </button>
              <button
                type="button"
                title="Delete route"
                disabled={branches.length <= 1}
                onClick={() => removeBranch(br.id)}
                style={{
                  background: 'none', border: 'none', cursor: branches.length <= 1 ? 'not-allowed' : 'pointer',
                  opacity: branches.length <= 1 ? 0.3 : 1, padding: 2,
                }}
              >
                <IconDelete color="#f87171" />
              </button>
            </div>
            {!collapsed && !isActive && (
              <div style={{ padding: '0 8px 8px', fontSize: 9, color: '#6b6b80' }}>
                {br.conditionRows?.length ?? 0} condition row(s) — click title to edit
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
