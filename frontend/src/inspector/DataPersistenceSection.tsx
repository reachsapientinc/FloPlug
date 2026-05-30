import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Field, Sel, Inp, Help } from './ui';
import type { NodeDataPersistence, NodePersistenceScope } from '@floplug/shared';
import { DEFAULT_NODE_DATA_PERSISTENCE } from '@floplug/shared';

const SCOPES: { id: NodePersistenceScope; label: string }[] = [
  { id: 'cStream',    label: 'cStream' },
  { id: 'local',      label: 'local' },
  { id: 'global',     label: 'global' },
  { id: 'selective',  label: 'Selective paths' },
];

function toggleScope(
  list: NodePersistenceScope[] | undefined,
  scope: NodePersistenceScope,
  on: boolean,
): NodePersistenceScope[] {
  const cur = list ?? [];
  if (on) return cur.includes(scope) ? cur : [...cur, scope];
  return cur.filter(s => s !== scope);
}

interface Props {
  value:    NodeDataPersistence | undefined;
  onChange: (next: NodeDataPersistence) => void;
}

export const DataPersistenceSection: React.FC<Props> = ({ value, onChange }) => {
  const t = useTheme();
  const cfg = value ?? DEFAULT_NODE_DATA_PERSISTENCE;
  const mode = cfg.mode ?? 'none';
  const isSelective = mode === 'selective';

  const patch = (partial: Partial<NodeDataPersistence>) => {
    onChange({ ...cfg, ...partial });
  };

  const scopeCheckboxes = (
    kind: 'input' | 'output',
    scopes: NodePersistenceScope[] | undefined,
    paths: string | undefined,
  ) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 4 }}>
        {kind === 'input' ? 'Inputs to store' : 'Outputs to store'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        {SCOPES.map(s => (
          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(scopes ?? []).includes(s.id)}
              onChange={e => {
                const next = toggleScope(scopes, s.id, e.target.checked);
                patch(kind === 'input' ? { inputScopes: next } : { outputScopes: next });
              }}
            />
            {s.label}
          </label>
        ))}
      </div>
      {(scopes ?? []).includes('selective') && (
        <Inp
          value={paths ?? ''}
          placeholder="e.g. cStream.message, local.batchId, global.tenantId"
          onChange={e => patch(kind === 'input' ? { inputPaths: e.target.value } : { outputPaths: e.target.value })}
        />
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${t.panelBorder}` }}>
      <Field label="Data persistence (Execution Hub)">
        <Sel
          value={mode}
          onChange={e => {
            const m = e.target.value as 'none' | 'selective';
            if (m === 'none') {
              onChange(DEFAULT_NODE_DATA_PERSISTENCE);
            } else {
              onChange({
                mode: 'selective',
                inputScopes:  cfg.inputScopes?.length ? cfg.inputScopes : ['cStream'],
                outputScopes: cfg.outputScopes?.length ? cfg.outputScopes : ['cStream'],
                inputPaths:   cfg.inputPaths,
                outputPaths:  cfg.outputPaths,
              });
            }
          }}
        >
          <option value="none">None — do not store inputs/outputs/responses</option>
          <option value="selective">Selected inputs / outputs</option>
        </Sel>
        <Help>
          Default is none to minimize storage. Production runs only write what you select here.
          Test node never writes to Execution Hub.
        </Help>
      </Field>
      {isSelective && (
        <>
          {scopeCheckboxes('input', cfg.inputScopes, cfg.inputPaths)}
          {scopeCheckboxes('output', cfg.outputScopes, cfg.outputPaths)}
        </>
      )}
    </div>
  );
};
