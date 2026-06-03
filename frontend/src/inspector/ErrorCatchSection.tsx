/**
 * Inspector section — catch error scope + error-path data options.
 */

import React from 'react';
import {
  catchScopeEnabled,
  effectiveCatchScope,
  effectiveErrorDataSource,
  type CatchErrorScope,
  type ErrorPathDataSource,
  type FloErrorDefaults,
} from '@floplug/shared';
import { Field, Sel, Inp, Help } from './ui';

const CATCH_OPTIONS: { value: CatchErrorScope; label: string }[] = [
  { value: 'inherit',  label: 'Inherit (Start defaults)' },
  { value: 'none',     label: 'None — propagate upward' },
  { value: 'self',     label: 'This node only' },
  { value: 'subtree',  label: 'This node and below' },
];

const DATA_OPTIONS: { value: ErrorPathDataSource; label: string }[] = [
  { value: 'inherit',           label: 'Inherit (Start defaults)' },
  { value: 'cStreamAtCatcher',  label: 'cStream as of this node' },
  { value: 'cStreamAtError',    label: 'cStream from error node' },
  { value: 'local',             label: 'local variable' },
  { value: 'global',            label: 'global variable' },
];

export const ErrorCatchSection: React.FC<{
  data:           Record<string, unknown>;
  floDefaults?:   FloErrorDefaults;
  onChange:       (patch: Record<string, unknown>) => void;
  /** Start node — edit flo-wide defaults directly */
  isStartNode?:   boolean;
}> = ({ data, floDefaults, onChange, isStartNode = false }) => {
  if (isStartNode) {
    const defs = (data.floErrorDefaults as FloErrorDefaults | undefined) ?? {};
    const patchDefs = (p: Partial<FloErrorDefaults>) =>
      onChange({ floErrorDefaults: { ...defs, ...p } });

    return (
      <>
        <Field label="Flo error defaults">
          <Help>Default catch behavior for all nodes (override per node). Unhandled errors fail the run.</Help>
        </Field>
        <Field label="Default catch">
          <Sel
            value={(() => {
              const s = defs.catchScope ?? 'none';
              return s === 'inherit' ? 'none' : s;
            })()}
            onChange={e => {
              const v = e.target.value as CatchErrorScope;
              patchDefs({ catchScope: v === 'inherit' ? 'none' : v });
            }}
          >
            {CATCH_OPTIONS.filter(o => o.value !== 'inherit').map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Sel>
        </Field>
        {catchScopeEnabled(defs.catchScope ?? 'none') && (
          <Field label="Error path data">
            <Sel
              value={defs.errorDataSource ?? 'cStreamAtError'}
              onChange={e => patchDefs({ errorDataSource: e.target.value as ErrorPathDataSource })}
            >
              {DATA_OPTIONS.filter(o => o.value !== 'inherit').map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Sel>
          </Field>
        )}
        {(defs.errorDataSource === 'local' || defs.errorDataSource === 'global') && (
          <Field label="Variable name">
            <Inp
              value={defs.errorDataRef ?? ''}
              placeholder="e.g. errorPayload"
              onChange={e => patchDefs({ errorDataRef: e.target.value })}
            />
          </Field>
        )}
      </>
    );
  }

  const effective = effectiveCatchScope(
    { id: '', type: '', data },
    floDefaults,
  );
  const showData = catchScopeEnabled(effective);

  return (
    <>
      <Field label="Catch error">
        <Sel
          value={(data.catchErrorScope as CatchErrorScope) ?? 'inherit'}
          onChange={e => onChange({ catchErrorScope: e.target.value as CatchErrorScope })}
        >
          {CATCH_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Sel>
        {showData && (
          <Help>Wire the red error handle when catch is enabled. Turning catch off removes error wires.</Help>
        )}
      </Field>
      {showData && (
        <>
          <Field label="Error path data">
            <Sel
              value={(data.errorDataSource as ErrorPathDataSource) ?? 'inherit'}
              onChange={e => onChange({ errorDataSource: e.target.value as ErrorPathDataSource })}
            >
              {DATA_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Sel>
          </Field>
          {(() => {
            const src = effectiveErrorDataSource({ id: '', type: '', data }, floDefaults);
            if (src !== 'local' && src !== 'global') return null;
            return (
              <Field label="Variable name">
                <Inp
                  value={String(data.errorDataRef ?? '')}
                  placeholder="e.g. errorPayload"
                  onChange={e => onChange({ errorDataRef: e.target.value })}
                />
              </Field>
            );
          })()}
        </>
      )}
    </>
  );
};

/** Remove error-handle edges from a node when catch is disabled. */
export function stripErrorEdgesForNode<E extends { id?: string; source: string; target: string; sourceHandle?: string | null }>(
  nodeId: string,
  nodeData: Record<string, unknown>,
  edges: E[],
  floDefaults?: FloErrorDefaults,
): E[] {
  if (showErrorHandleOnNode(nodeData, floDefaults)) return edges;
  return edges.filter(
    e => !(e.source === nodeId && (e.sourceHandle ?? '') === 'error'),
  );
}

export function showErrorHandleOnNode(
  data: Record<string, unknown>,
  floDefaults?: FloErrorDefaults,
): boolean {
  return catchScopeEnabled(effectiveCatchScope({ id: '', type: '', data }, floDefaults));
}
