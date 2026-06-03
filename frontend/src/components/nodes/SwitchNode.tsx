/**
 * FloSwitch canvas node — multiple source handles, branch list, add/delete/reorder.
 */
import React, { useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  createSwitchBranch,
  nodeDisplayTitle,
  sortSwitchBranches,
  SWITCH_DEFAULT_HANDLE,
  type SwitchBranch,
} from '@floplug/shared';
import { deriveNodeStatus, outputTargetBadge, ErrorSourceHandle } from './CompactNode';
import { FlowNodeShell, nodeDeleteHandler, nodeDimensions } from './FlowNodeShell';
import { IconAdd, IconChevron, IconDelete, IconDrag } from '../../inspector/icons';

const COLOR = '#6366f1';

export const SwitchNode: React.FC<NodeProps> = ({ id, data, selected, width, height, measured }) => {
  const d = data as Record<string, unknown>;
  const onUpdate = d.onUpdate as ((nid: string, patch: Record<string, unknown>) => void) | undefined;

  const branches = useMemo(
    () => sortSwitchBranches((d.branches as SwitchBranch[]) ?? []),
    [d.branches],
  );
  const activeId = String(d.activeBranchId ?? branches[0]?.id ?? '');
  const showError = !!d._showErrorHandle;
  const title = nodeDisplayTitle(d, 'FloSwitch');
  const n = branches.length;
  const computedH = Math.max(88, 36 + n * 22 + 28);
  const dims = nodeDimensions({ width, height, measured }, { width: 200, height: computedH });

  const setBranches = useCallback((next: SwitchBranch[], activeBranchId?: string) => {
    onUpdate?.(id, {
      branches: next.map((b, i) => ({ ...b, order: i })),
      ...(activeBranchId != null ? { activeBranchId } : {}),
    });
  }, [id, onUpdate]);

  const addBranch = (e: React.MouseEvent) => {
    e.stopPropagation();
    const br = createSwitchBranch(`Route ${branches.length + 1}`);
    br.order = branches.length;
    setBranches([...branches, br], br.id);
  };

  const removeBranch = (e: React.MouseEvent, branchId: string) => {
    e.stopPropagation();
    if (branches.length <= 1) return;
    const next = branches.filter(b => b.id !== branchId);
    setBranches(next, activeId === branchId ? next[0]?.id : activeId);
  };

  const selectBranch = (branchId: string) => {
    onUpdate?.(id, { activeBranchId: branchId });
  };

  const toggleCollapsed = (e: React.MouseEvent, branchId: string, cur: boolean) => {
    e.stopPropagation();
    setBranches(branches.map(b => b.id === branchId ? { ...b, collapsed: !cur } : b));
  };

  const dragRef = React.useRef<{ idx: number } | null>(null);

  const handleTop = (index: number, total: number) =>
    `${((index + 1) / (total + 2)) * 100}%`;

  return (
    <FlowNodeShell
      selected={!!selected}
      color={COLOR}
      width={dims.width}
      height={dims.height}
      minWidth={180}
      minHeight={computedH}
      onDelete={nodeDeleteHandler(d, id)}
      extras={
        <>
          <Handle type="target" position={Position.Left} style={{
            width: 10, height: 10, background: COLOR, border: '2px solid #0f1117', borderRadius: '50%',
          }} />
          {branches.map((br, i) => (
            <Handle
              key={br.id}
              type="source"
              id={br.id}
              position={Position.Right}
              style={{
                width: 8, height: 8, background: COLOR,
                border: '2px solid #0f1117', top: handleTop(i, branches.length),
              }}
              title={br.label}
            />
          ))}
          <Handle
            type="source"
            id={SWITCH_DEFAULT_HANDLE}
            position={Position.Right}
            style={{
              width: 8, height: 8, background: '#6b6b80',
              border: '2px dashed #0f1117', top: showError ? '86%' : '92%',
            }}
            title="defaultFlo"
          />
          {showError && <ErrorSourceHandle top="96%" />}
        </>
      }
    >
      <div style={{
        width: '100%', height: '100%', boxSizing: 'border-box',
        padding: '6px 8px', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5, flexShrink: 0,
            background: `${COLOR}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color: COLOR,
          }}>SW</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#e8e8f0',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{title}</div>
            <div style={{ fontSize: 8, color: '#6b6b80' }}>{n} route{n === 1 ? '' : 's'} · first match</div>
          </div>
          {selected && (
            <button
              type="button"
              title="Add route"
              onClick={addBranch}
              style={{
                width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                background: `${COLOR}33`, border: `0.5px solid ${COLOR}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <IconAdd color={COLOR} />
            </button>
          )}
        </div>

        {selected && (
          <div style={{ maxHeight: height - 44, overflowY: 'auto' }}>
            {branches.map((br, idx) => {
              const isActive = br.id === activeId;
              const collapsed = isActive ? false : (br.collapsed ?? true);
              return (
                <div
                  key={br.id}
                  draggable
                  onDragStart={e => { e.stopPropagation(); dragRef.current = { idx }; }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.stopPropagation();
                    const from = dragRef.current;
                    if (from == null || from.idx === idx) return;
                    const copy = [...branches];
                    const [item] = copy.splice(from.idx, 1);
                    copy.splice(idx, 0, item);
                    setBranches(copy);
                    dragRef.current = null;
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '2px 0', fontSize: 8, color: isActive ? COLOR : '#9ca3af',
                    borderLeft: isActive ? `2px solid ${COLOR}` : '2px solid transparent',
                    paddingLeft: 4, marginBottom: 2,
                  }}
                >
                  <span style={{ cursor: 'grab', opacity: 0.5 }}><IconDrag color="#6b6b80" /></span>
                  <button
                    type="button"
                    onClick={e => toggleCollapsed(e, br.id, collapsed)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <IconChevron open={!collapsed} color="#6b6b80" />
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); selectBranch(br.id); }}
                    style={{
                      flex: 1, textAlign: 'left', background: 'none', border: 'none',
                      color: 'inherit', fontSize: 8, cursor: 'pointer', padding: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {!collapsed ? br.label : `${idx + 1}. ${br.label}`}
                  </button>
                  <button
                    type="button"
                    onClick={e => removeBranch(e, br.id)}
                    disabled={branches.length <= 1}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      cursor: branches.length <= 1 ? 'not-allowed' : 'pointer',
                      opacity: branches.length <= 1 ? 0.25 : 0.8,
                    }}
                  >
                    <IconDelete color="#f87171" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!selected && (
          <div style={{ fontSize: 8, color: '#6b6b80', marginTop: 2 }}>
            {branches.map(b => b.label).slice(0, 2).join(' · ')}
            {n > 2 ? ` +${n - 2}` : ''}
          </div>
        )}

        {outputTargetBadge(d) && (
          <div style={{
            fontSize: 7, color: '#39ff14', marginTop: 4,
            background: 'rgba(57,255,20,0.07)', border: '0.5px solid rgba(57,255,20,0.2)',
            borderRadius: 3, padding: '1px 5px', alignSelf: 'flex-start',
          }}>{outputTargetBadge(d)}</div>
        )}
      </div>
    </FlowNodeShell>
  );
};
