/**
 * FloAction field mapper — target from kit schema, source from sample upload, click-to-wire.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type { ParsedField } from '@floplug/shared';
import { Field, Btn, Help } from './ui';
import {
  buildSourceTree,
  parseSampleInput,
  suggestMappingRules,
  countMappedRequired,
  getSourcePathForTarget,
  type MappingRuleClient,
  type SourceFieldNode,
} from '../lib/floActionMapper';

interface TargetTreeNode {
  path:      string;
  label:     string;
  required:  boolean;
  repeating: boolean;
  children?: TargetTreeNode[];
}

interface MappingTargetResponse {
  fields:        ParsedField[];
  tree:          TargetTreeNode[];
  actionLabel:   string;
  schemaSource:  string;
  requiredCount: number;
  fromCache?:    boolean;
}

interface Props {
  functions:     Functions;
  hubId:         string;
  tenantId:      string;
  connectorId:   string;
  floKitId:      string;
  actionId:      string;
  connectionId:  string;
  mappingRules:  MappingRuleClient[];
  onRulesChange: (rules: MappingRuleClient[]) => void;
}

const panelStyle: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: '0.5px solid rgba(16,185,129,0.25)',
};

const colStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  maxHeight: 160,
  overflowY: 'auto',
  border: '0.5px solid #2a2a3a',
  borderRadius: 6,
  padding: 6,
  fontSize: 9,
};

function rowBtn(active: boolean, mapped: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '3px 6px',
    marginBottom: 2,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 9,
    fontFamily: 'inherit',
    background: active ? 'rgba(79,142,247,0.25)' : mapped ? 'rgba(16,185,129,0.12)' : 'transparent',
    color: active ? '#4f8ef7' : mapped ? '#10b981' : '#9ca3af',
  };
}

function SourceRows({
  nodes,
  depth,
  selectedPath,
  mappedPaths,
  onSelect,
}: {
  nodes:        SourceFieldNode[];
  depth:        number;
  selectedPath: string | null;
  mappedPaths:  Set<string>;
  onSelect:     (path: string) => void;
}) {
  return (
    <>
      {nodes.map(n => (
        <div key={n.path} style={{ paddingLeft: depth * 8 }}>
          {(!n.children || n.children.length === 0) ? (
            <button
              type="button"
              style={rowBtn(selectedPath === n.path, mappedPaths.has(n.path))}
              onClick={() => onSelect(n.path)}
            >
              {n.label}
            </button>
          ) : (
            <>
              <span style={{ color: '#4b5563', fontSize: 8 }}>{n.label}</span>
              <SourceRows
                nodes={n.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                mappedPaths={mappedPaths}
                onSelect={onSelect}
              />
            </>
          )}
        </div>
      ))}
    </>
  );
}

function TargetRows({
  fields,
  tree,
  depth,
  selectedTarget,
  rules,
  onSelectTarget,
}: {
  fields:         ParsedField[];
  tree:           TargetTreeNode[];
  depth:          number;
  selectedTarget: string | null;
  rules:          MappingRuleClient[];
  onSelectTarget: (path: string) => void;
}) {
  const fieldByPath = useMemo(() => new Map(fields.map(f => [f.path, f])), [fields]);

  return (
    <>
      {tree.map(n => {
        const f = fieldByPath.get(n.path);
        const isLeaf = !n.children?.length;

        if (isLeaf && f) {
          const mapped = !!getSourcePathForTarget(rules, n.path);
          return (
            <div key={n.path} style={{ paddingLeft: depth * 8 }}>
              <button
                type="button"
                style={rowBtn(selectedTarget === n.path, mapped)}
                onClick={() => onSelectTarget(n.path)}
              >
                {f.required && <span style={{ color: '#ef4444' }}>* </span>}
                {n.label}
                {f.repeating && <span style={{ color: '#6b7280' }}> []</span>}
              </button>
            </div>
          );
        }

        return (
          <div key={n.path}>
            <div style={{ paddingLeft: depth * 8 }}>
              <span style={{ color: '#4b5563', fontSize: 8 }}>{n.label}</span>
              {n.children && (
                <TargetRows
                  fields={fields}
                  tree={n.children}
                  depth={depth + 1}
                  selectedTarget={selectedTarget}
                  rules={rules}
                  onSelectTarget={onSelectTarget}
                />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export const FloActionFieldMapper: React.FC<Props> = ({
  functions,
  hubId,
  tenantId,
  connectorId,
  floKitId,
  actionId,
  connectionId,
  mappingRules,
  onRulesChange,
}) => {
  const [loadingTarget, setLoadingTarget]   = useState(false);
  const [targetError, setTargetError]       = useState('');
  const [targetMeta, setTargetMeta]         = useState<MappingTargetResponse | null>(null);
  const [sourceObj, setSourceObj]           = useState<Record<string, unknown> | null>(null);
  const [sampleError, setSampleError]       = useState('');
  const [pickSource, setPickSource]         = useState<string | null>(null);
  const [pickTarget, setPickTarget]         = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewText, setPreviewText]       = useState('');

  const sourceTree = useMemo(
    () => (sourceObj ? buildSourceTree(sourceObj) : []),
    [sourceObj],
  );

  const mappedSourcePaths = useMemo(() => {
    const s = new Set<string>();
    for (const r of mappingRules) {
      if (r.sourceField) s.add(r.sourceField);
    }
    return s;
  }, [mappingRules]);

  const progress = useMemo(() => {
    if (!targetMeta?.fields) return null;
    return countMappedRequired(targetMeta.fields, mappingRules);
  }, [targetMeta, mappingRules]);

  const loadTarget = useCallback(async () => {
    if (!connectorId || !floKitId || !actionId) return;
    setLoadingTarget(true);
    setTargetError('');
    try {
      const fn = httpsCallable<
        { connectorId: string; floKitId: string; actionId: string },
        MappingTargetResponse
      >(functions, 'resolveFloActionMappingTarget');
      const { data } = await fn({ connectorId, floKitId, actionId });
      setTargetMeta(data);
    } catch (err: unknown) {
      setTargetError(err instanceof Error ? err.message : String(err));
      setTargetMeta(null);
    } finally {
      setLoadingTarget(false);
    }
  }, [functions, connectorId, floKitId, actionId]);

  useEffect(() => { loadTarget(); }, [loadTarget]);

  const onSampleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSampleError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result ?? '');
        const format = file.name.endsWith('.xml') || raw.trimStart().startsWith('<') ? 'xml' : 'json';
        const obj = parseSampleInput(raw, format);
        setSourceObj(obj);
        if (targetMeta?.fields) {
          onRulesChange(suggestMappingRules(targetMeta.fields, obj, []));
        }
      } catch (err: unknown) {
        setSampleError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onSelectSource = (path: string) => {
    if (pickTarget) {
      const next = mappingRules.filter(r => r.targetField !== pickTarget);
      next.push({ targetField: pickTarget, sourceType: 'cStream', sourceField: path });
      onRulesChange(next);
      setPickTarget(null);
      setPickSource(null);
      return;
    }
    setPickSource(path);
    setPickTarget(null);
  };

  const onSelectTarget = (path: string) => {
    if (pickSource) {
      const next = mappingRules.filter(r => r.targetField !== path);
      next.push({ targetField: path, sourceType: 'cStream', sourceField: pickSource });
      onRulesChange(next);
      setPickSource(null);
      setPickTarget(null);
      return;
    }
    setPickTarget(path);
    setPickSource(null);
  };

  const onAutoMap = () => {
    if (!targetMeta?.fields || !sourceObj) return;
    onRulesChange(suggestMappingRules(targetMeta.fields, sourceObj, mappingRules));
  };

  const onPreviewRequest = async () => {
    if (!connectionId || !sourceObj) {
      setPreviewText('Upload a sample and select a connection first.');
      return;
    }
    setPreviewLoading(true);
    setPreviewText('');
    try {
      const fn = httpsCallable(functions, 'executeFloAction');
      const { data } = await fn({
        hubId, tenantId, connectorId, floKitId, actionId, connectionId,
        cStream: sourceObj, localStore: {}, globalStore: {},
        mappingRules, debug: true, dryRun: true,
      }) as { data: { debug?: {
        requestBodyInner?: string;
        validationWouldFail?: boolean;
        unmappedRequired?: string[];
        mappedFieldCount?: number;
      } } };

      const dbg = data.debug;
      if (!dbg) {
        setPreviewText('No debug payload returned.');
        return;
      }
      setPreviewText([
        dbg.validationWouldFail ? '⚠ Required fields still unmapped' : '✓ Required fields satisfied',
        `Mapped: ${dbg.mappedFieldCount ?? 0} fields`,
        dbg.unmappedRequired?.length ? `Missing required: ${dbg.unmappedRequired.join(', ')}` : '',
        '',
        '── Request body (sparse — mapped fields only) ──',
        (dbg.requestBodyInner ?? '').slice(0, 8000),
      ].filter(Boolean).join('\n'));
    } catch (err: unknown) {
      setPreviewText(`Preview failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (!actionId) {
    return (
      <div style={panelStyle}>
        <Help>Select an action to load mapping fields.</Help>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <Field label="Field mapping">
        {loadingTarget && <Help>Loading target schema…</Help>}
        {targetError && <span style={{ fontSize: 9, color: '#ef4444' }}>{targetError}</span>}
        {targetMeta && (
          <Help>
            Target: {targetMeta.actionLabel} ({targetMeta.schemaSource})
            {targetMeta.fromCache ? ' · cached' : ''}
            {progress ? ` · ${progress.mapped}/${progress.required} required` : ''}
          </Help>
        )}

        <div style={{ marginTop: 6, marginBottom: 6 }}>
          <input type="file" accept=".json,.xml,application/json,text/xml" onChange={onSampleFile} style={{ fontSize: 9, width: '100%' }} />
          <Help>Upload sample JSON or XML — fields appear on the left</Help>
          {sampleError && <span style={{ color: '#ef4444', fontSize: 9, display: 'block' }}>{sampleError}</span>}
        </div>

        {(pickSource || pickTarget) && (
          <span style={{ fontSize: 9, color: '#4f8ef7', marginBottom: 4, display: 'block' }}>
            {pickSource ? `Source "${pickSource}" — click a target` : 'Target selected — click a source'}
          </span>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <div style={colStyle}>
            <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 4, display: 'block' }}>Your data</div>
            {sourceTree.length === 0 ? (
              <span style={{ color: '#4b5563' }}>Upload a sample</span>
            ) : (
              <SourceRows nodes={sourceTree} depth={0} selectedPath={pickSource} mappedPaths={mappedSourcePaths} onSelect={onSelectSource} />
            )}
          </div>
          <div style={colStyle}>
            <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: 4, display: 'block' }}>Action needs</div>
            {!targetMeta?.tree?.length ? (
              <span style={{ color: '#4b5563' }}>Loading…</span>
            ) : (
              <TargetRows fields={targetMeta.fields} tree={targetMeta.tree} depth={0} selectedTarget={pickTarget} rules={mappingRules} onSelectTarget={onSelectTarget} />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <Btn variant="ghost" onClick={onAutoMap} disabled={!sourceObj || !targetMeta}>Auto-map</Btn>
          <Btn variant="ghost" onClick={onPreviewRequest} disabled={previewLoading || !sourceObj}>
            {previewLoading ? 'Preview…' : 'Preview request'}
          </Btn>
          <Btn variant="ghost" onClick={() => onRulesChange([])} disabled={!mappingRules.length}>Clear</Btn>
        </div>

        {mappingRules.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 8, color: '#6b7280', maxHeight: 48, overflowY: 'auto' }}>
            {mappingRules.map(r => (
              <div key={r.targetField}>{r.sourceField} → {r.targetField}</div>
            ))}
          </div>
        )}

        {previewText && (
          <pre style={{ marginTop: 8, fontSize: 8, color: '#9ca3af', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', background: '#0d0d14', padding: 6, borderRadius: 4 }}>
            {previewText}
          </pre>
        )}
      </Field>
    </div>
  );
};
