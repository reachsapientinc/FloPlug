/**
 * Reusable SubFlo / Invoke argument editors with FloExpression support.
 */

import React from 'react';
import type { Node } from '@xyflow/react';
import { createSubFloInputArg, createSubFloReturnArg, nodeDisplayTitle, type SubFloInputArg, type SubFloReturnArg, type SubFloReturnBinding, type SubFloInputBinding, listSubFloAnchors } from '@floplug/shared';
import { useTheme } from '../theme/ThemeContext';
import { Field, Inp, TextArea, Btn, Help, FieldLabel } from './ui';
import { ExpressionFieldWithLibrary } from './expression/ExpressionEditorKit';
import { IconAdd, IconDelete } from './icons';

const rowBtn: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: 0.85,
};

export const SubFloContractEditor: React.FC<{
  description: string;
  inputArgs:   SubFloInputArg[];
  returnArgs:  SubFloReturnArg[];
  onChange:    (patch: Record<string, unknown>) => void;
}> = ({ description, inputArgs, returnArgs, onChange }) => {
  const t = useTheme();

  const patchInput = (next: SubFloInputArg[]) => onChange({ inputArgs: next });
  const patchReturn = (next: SubFloReturnArg[]) => onChange({ returnArgs: next });

  return (
    <>
      <Help>Use <strong>Canvas display name</strong> above for the label on canvas and in InvokeSubFlo dropdown.</Help>
      <Field label="Description">
        <TextArea
          rows={3}
          value={description}
          placeholder="Tooltip help — what this SubFlo does"
          onChange={e => onChange({ description: e.target.value })}
          style={{ fontFamily: 'inherit', color: t.textSecondary }}
        />
      </Field>

      <SectionBlock title="Input arguments">
        {inputArgs.map((arg, i) => (
          <div key={arg.id} style={argCard(t)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <FieldLabel>Input {i + 1}</FieldLabel>
              <button type="button" style={rowBtn} onClick={() => patchInput(inputArgs.filter(a => a.id !== arg.id))}>
                <IconDelete color={t.danger} />
              </button>
            </div>
            <Field label="Name">
              <Inp value={arg.name} placeholder="e.g. pageSize" onChange={e => {
                const next = [...inputArgs];
                next[i] = { ...arg, name: e.target.value };
                patchInput(next);
              }} />
            </Field>
            <Field label="Description">
              <Inp value={arg.description ?? ''} onChange={e => {
                const next = [...inputArgs];
                next[i] = { ...arg, description: e.target.value };
                patchInput(next);
              }} />
            </Field>
            <Field label="Default value (expression)">
              <ExpressionFieldWithLibrary
                value={arg.defaultValue ?? ''}
                onChange={v => {
                  const next = [...inputArgs];
                  next[i] = { ...arg, defaultValue: v };
                  patchInput(next);
                }}
                rows={2}
                placeholder="Optional default FloExpression"
              />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: t.textSecondary }}>
              <input
                type="checkbox"
                checked={arg.required}
                onChange={e => {
                  const next = [...inputArgs];
                  next[i] = { ...arg, required: e.target.checked };
                  patchInput(next);
                }}
              />
              Required
            </label>
          </div>
        ))}
        <Btn variant="ghost" onClick={() => patchInput([...inputArgs, createSubFloInputArg()])}>
          + Add input argument
        </Btn>
      </SectionBlock>

      <SectionBlock title="Return arguments">
        <Help>After invoke, each return name becomes <code>local.&lt;name&gt;</code> on the main flow.</Help>
        {returnArgs.map((arg, i) => (
          <div key={arg.id} style={argCard(t)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <FieldLabel>Return {i + 1}</FieldLabel>
              <button type="button" style={rowBtn} onClick={() => patchReturn(returnArgs.filter(a => a.id !== arg.id))}>
                <IconDelete color={t.danger} />
              </button>
            </div>
            <Field label="Name">
              <Inp value={arg.name} placeholder="e.g. continue" onChange={e => {
                const next = [...returnArgs];
                next[i] = { ...arg, name: e.target.value };
                patchReturn(next);
              }} />
            </Field>
            <Field label="Description">
              <Inp value={arg.description ?? ''} onChange={e => {
                const next = [...returnArgs];
                next[i] = { ...arg, description: e.target.value };
                patchReturn(next);
              }} />
            </Field>
          </div>
        ))}
        <Btn variant="ghost" onClick={() => patchReturn([...returnArgs, createSubFloReturnArg()])}>
          + Add return argument
        </Btn>
      </SectionBlock>
    </>
  );
};

export const InvokeSubFloBindingsEditor: React.FC<{
  targetSubFloId: string;
  inputBindings: SubFloInputBinding[];
  nodes: Node[];
  onChange: (patch: Record<string, unknown>) => void;
}> = ({ targetSubFloId, inputBindings, nodes, onChange }) => {
  const t = useTheme();
  const anchors = listSubFloAnchors(
    nodes.map(n => ({ id: n.id, type: n.type ?? '', data: n.data as Record<string, unknown> })),
  );
  const anchor = anchors.find(a => a.id === targetSubFloId);
  const inputArgs = (anchor?.data.inputArgs as SubFloInputArg[] | undefined) ?? [];
  const returnArgs = (anchor?.data.returnArgs as SubFloReturnArg[] | undefined) ?? [];

  const syncBindings = (targetId: string, nextAnchor?: typeof anchor) => {
    const args = (nextAnchor?.data.inputArgs as SubFloInputArg[] | undefined) ?? [];
    const existing = Object.fromEntries(inputBindings.map(b => [b.argName, b.valueExpr]));
    onChange({
      targetSubFloId: targetId,
      inputBindings: args.map(a => ({
        argName:   a.name,
        valueExpr: existing[a.name] ?? a.defaultValue ?? '',
      })),
    });
  };

  return (
    <>
      <Field label="SubFlo">
        <select
          value={targetSubFloId}
          onChange={e => {
            const id = e.target.value;
            const sel = anchors.find(a => a.id === id);
            syncBindings(id, sel);
          }}
          style={selectStyle(t)}
        >
          <option value="">— Select SubFlo —</option>
          {anchors.map(a => {
            const d = a.data as Record<string, unknown>;
            const title = nodeDisplayTitle(d, 'SubFlo');
            const titleHint = String(d.description ?? '');
            return (
              <option key={a.id} value={a.id} title={titleHint}>
                {title}
              </option>
            );
          })}
        </select>
      </Field>

      {targetSubFloId && inputArgs.length > 0 && (
        <SectionBlock title="Input values">
          {inputArgs.map((arg, i) => {
            const binding = inputBindings.find(b => b.argName === arg.name);
            const val = binding?.valueExpr ?? '';
            return (
              <div key={arg.id} style={argCard(t)}>
                <div style={{ fontSize: 10, fontWeight: 600, color: t.textPrimary, marginBottom: 4 }}>
                  {arg.name}
                  {arg.required && <span style={{ color: t.warning, marginLeft: 4 }}>*</span>}
                </div>
                {arg.description && (
                  <div style={{ fontSize: 9, color: t.textMuted, marginBottom: 6 }}>{arg.description}</div>
                )}
                <ExpressionFieldWithLibrary
                  value={val}
                  onChange={v => {
                    const next = [...inputBindings];
                    const idx = next.findIndex(b => b.argName === arg.name);
                    if (idx >= 0) next[idx] = { argName: arg.name, valueExpr: v };
                    else next.push({ argName: arg.name, valueExpr: v });
                    onChange({ inputBindings: next });
                  }}
                  rows={2}
                  placeholder={arg.defaultValue ? `Default: ${arg.defaultValue}` : 'FloExpression value'}
                />
              </div>
            );
          })}
        </SectionBlock>
      )}

      {targetSubFloId && returnArgs.length > 0 && (
        <SectionBlock title="Return arguments (→ main local)">
          {returnArgs.map(r => (
            <div key={r.id} style={{ fontSize: 10, color: t.textSecondary, marginBottom: 4 }}>
              <code style={{ color: t.accent }}>local.{r.name}</code>
              {r.description ? ` — ${r.description}` : ''}
            </div>
          ))}
        </SectionBlock>
      )}
    </>
  );
};

export const SubFloReturnBindingsEditor: React.FC<{
  returnBindings: SubFloReturnBinding[];
  returnArgNames: string[];
  onChange: (bindings: SubFloReturnBinding[]) => void;
}> = ({ returnBindings, returnArgNames, onChange }) => {
  const t = useTheme();

  const upsert = (i: number, patch: Partial<SubFloReturnBinding>) => {
    const next = [...returnBindings];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const rows = returnArgNames.length > 0
    ? returnArgNames.map(name => returnBindings.find(b => b.argName === name) ?? { argName: name, source: 'local' as const, value: '' })
    : returnBindings;

  return (
    <SectionBlock title="Return bindings">
      <Help>Map each SubFlo return argument to a value from this compartment.</Help>
      {rows.map((row, i) => (
        <div key={`${row.argName}-${i}`} style={argCard(t)}>
          <Field label="Return arg">
            <Inp value={row.argName} onChange={e => upsert(i, { argName: e.target.value })} />
          </Field>
          <Field label="Source">
            <select
              value={row.source}
              onChange={e => upsert(i, { source: e.target.value as SubFloReturnBinding['source'] })}
              style={selectStyle(t)}
            >
              <option value="local">local path</option>
              <option value="cStream">cStream path</option>
              <option value="expression">expression</option>
            </select>
          </Field>
          {row.source === 'expression' ? (
            <ExpressionFieldWithLibrary
              value={row.value}
              onChange={v => upsert(i, { value: v })}
              rows={2}
            />
          ) : (
            <Field label={row.source === 'local' ? 'Local path' : 'cStream path'}>
              <Inp value={row.value} onChange={e => upsert(i, { value: e.target.value })} />
            </Field>
          )}
        </div>
      ))}
      {returnArgNames.length === 0 && (
        <Btn variant="ghost" onClick={() => onChange([...returnBindings, { argName: '', source: 'local', value: '' }])}>
          + Add binding
        </Btn>
      )}
    </SectionBlock>
  );
};

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <div style={{
      marginTop: 12, marginBottom: 10, paddingTop: 10,
      borderTop: `0.5px solid ${t.panelBorder}`,
    }}>
      <FieldLabel>{title}</FieldLabel>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function argCard(t: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    background: t.sectionBg,
    border: `0.5px solid ${t.sectionBorder}`,
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 8,
  };
}

function selectStyle(t: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    width: '100%', padding: '5px 7px', borderRadius: 4,
    border: `0.5px solid ${t.border}`, background: t.inputBg, color: t.inputText,
    fontSize: 10, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
}

export function subFloAnchorForNode(
  nodes: Node[],
  subFloId: string | undefined,
): { inputArgs: SubFloInputArg[]; returnArgs: SubFloReturnArg[] } {
  if (!subFloId) return { inputArgs: [], returnArgs: [] };
  const anchor = nodes.find(n => n.id === subFloId && n.type === 'subFloNode');
  if (!anchor) return { inputArgs: [], returnArgs: [] };
  const d = anchor.data as Record<string, unknown>;
  return {
    inputArgs:  (d.inputArgs as SubFloInputArg[] | undefined) ?? [],
    returnArgs: (d.returnArgs as SubFloReturnArg[] | undefined) ?? [],
  };
}
