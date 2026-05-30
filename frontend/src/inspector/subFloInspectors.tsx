import React from 'react';
import type { NodeInspectorProps } from './types';
import { Field, Help } from './ui';
import { useTheme } from '../theme/ThemeContext';
import { OutputTargetSection } from './OutputTargetSection';
import { ExpressionFieldWithLibrary } from './expression/ExpressionEditorKit';
import {
  SubFloContractEditor,
  InvokeSubFloBindingsEditor,
  SubFloReturnBindingsEditor,
  subFloAnchorForNode,
} from './SubFloEditors';
import type { SubFloReturnBinding } from '@floplug/shared';

export const SubFloInspector: React.FC<NodeInspectorProps> = ({ node, onUpdate }) => {
  const d = node.data as Record<string, unknown>;
  return (
    <SubFloContractEditor
      description={String(d.description ?? '')}
      inputArgs={(d.inputArgs as import('@floplug/shared').SubFloInputArg[]) ?? []}
      returnArgs={(d.returnArgs as import('@floplug/shared').SubFloReturnArg[]) ?? []}
      onChange={patch => onUpdate(node.id, patch)}
    />
  );
};

export const InvokeSubFloInspector: React.FC<NodeInspectorProps> = ({ node, onUpdate, ctx }) => {
  const d = node.data as Record<string, unknown>;
  return (
    <>
      <InvokeSubFloBindingsEditor
        targetSubFloId={String(d.targetSubFloId ?? '')}
        inputBindings={(d.inputBindings as import('@floplug/shared').SubFloInputBinding[]) ?? []}
        nodes={ctx.nodes}
        onChange={patch => onUpdate(node.id, patch)}
      />
      <Help>Wire on main flow or on Loop loop-path. Return args become main <code>local.*</code>.</Help>
    </>
  );
};

export const SubFloReturnInspector: React.FC<NodeInspectorProps> = ({ node, onUpdate, ctx }) => {
  const d = node.data as Record<string, unknown>;
  const subFloId = String(d.subFloId ?? '');
  const { returnArgs } = subFloAnchorForNode(ctx.nodes, subFloId);
  const bindings = (d.returnBindings as SubFloReturnBinding[] | undefined) ?? [];

  return (
    <SubFloReturnBindingsEditor
      returnBindings={bindings}
      returnArgNames={returnArgs.map(r => r.name).filter(Boolean)}
      onChange={returnBindings => onUpdate(node.id, { returnBindings })}
    />
  );
};

export const LoopInspectorCore: React.FC<NodeInspectorProps> = ({ node, onUpdate }) => {
  const t = useTheme();
  const d = node.data as Record<string, unknown>;
  const outputTarget = String(d.outputTarget ?? 'cStream');
  const needsVar = outputTarget === 'local' || outputTarget === 'global';

  return (
    <>
      <Field label="Continue while (FloExpression)">
        <ExpressionFieldWithLibrary
          value={String(d.continueExpr ?? 'local.continue == true')}
          onChange={v => onUpdate(node.id, { continueExpr: v })}
          rows={3}
          placeholder="e.g. local.continue == true"
        />
        <Help>Evaluated in main scope after each loop-path run. Export flags via SubFlo return args.</Help>
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: t.textSecondary, marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={d.executeAtLeastOnce !== false}
          onChange={e => onUpdate(node.id, { executeAtLeastOnce: e.target.checked })}
        />
        Execute at least once (do-while)
      </label>

      <Field label="Max iterations">
        <input
          type="number"
          min={1}
          max={500}
          value={Number(d.maxIterations ?? 100)}
          onChange={e => onUpdate(node.id, {
            maxIterations: Math.min(500, Math.max(1, Number(e.target.value))),
          })}
          style={{
            width: '100%', padding: '5px 7px', borderRadius: 4,
            border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.inputText,
            fontSize: 10, fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </Field>

      <OutputTargetSection
        outputTarget={outputTarget}
        outputVarName={String(d.outputVarName ?? '')}
        onChange={p => onUpdate(node.id, p)}
      />
      {outputTarget === 'cStream' && (
        <Help>Exit path receives cStream from the last loop iteration.</Help>
      )}

      <Help>Wire loop handle → InvokeSubFlo (or other nodes). Wire exit handle → rest of flow.</Help>
    </>
  );
};
