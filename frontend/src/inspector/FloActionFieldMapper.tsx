/**
 * FloAction field mapper — target from kit schema, source from sample upload, click-to-wire.
 * Opens in a full-screen modal for readable mapping; inspector shows a compact summary.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type { ParsedField } from '@floplug/shared';
import {
  isWorkdayIdCompositePath,
  parseWorkdayIdCompositePath,
  isFieldEffectivelyRequired,
} from '@floplug/shared';
import {
  ExpressionInsertProvider,
  ExpressionTextarea,
  FunctionLibraryPanel,
  expressionSyntaxError,
} from './expression/ExpressionEditorKit';
import { Field, Btn, Help } from './ui';
import {
  buildSourceTree,
  parseSampleInput,
  suggestMappingRules,
  countMappedRequired,
  getRuleForTarget,
  upsertRule,
  removeRuleForTarget,
  removeRulesForSource,
  removeMappingsForTarget,
  hasMappingFromSource,
  hasMappingToTarget,
  resolveTargetValuePath,
  wireSourceToTargets,
  formatRuleSource,
  countRulesForSource,
  countRulesPerSource,
  defaultExpandedPaths,
  type MappingRuleClient,
  type SourceFieldNode,
} from '../lib/floActionMapper';

interface TargetTreeNode {
  path:      string;
  label:     string;
  required:  boolean;
  repeating: boolean;
  children?: TargetTreeNode[];
  fieldKind?:   'normal' | 'idBranch' | 'idTypeOption' | 'idTypeMissing';
  idValuePath?: string;
  idTypeValue?: string;
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

type MapperLayout = 'compact' | 'full';
/** Where the mapping editor sits in full-screen mapper. */
type MapperEditorDock = 'bottom' | 'left';
/** Left-docked editor width (trees shrink on the right). */
type MapperEditorWidth = 'normal' | 'wide' | 'max';

const MAPPER_SCROLL_CLASS = 'fp-mapper-scroll';

const LEFT_EDITOR_WIDTH: Record<MapperEditorWidth, string> = {
  normal: '42%',
  wide:   '58%',
  max:    '78%',
};

/** Isolated from App.css light --text-primary (#111) on dark modal. */
const MAPPER_UI = {
  text:       '#e5e7eb',
  textMuted:  '#9ca3af',
  textDim:    '#6b7280',
  panelBg:    '#12151c',
  inputBg:    '#1a1f2e',
  inputText:  '#f3f4f6',
  inputBorder:'rgba(255,255,255,0.14)',
  source:     '#6ee7b7',
  target:     '#fcd34d',
  accent:     '#93c5fd',
} as const;

const WORKDAY_ID_TYPE_DATALIST = [
  'WID',
  'Revenue_Category_ID',
  'Customer_ID',
  'Supplier_ID',
  'Organization_Reference_ID',
  'Cost_Center_Reference_ID',
  'Company_Reference_ID',
  'Worker_Reference_ID',
  'Sales_Item_ID',
  'Project_ID',
  'Region_Reference_ID',
];

const mapperFieldInput: React.CSSProperties = {
  width: '100%',
  marginBottom: 8,
  fontSize: 12,
  padding: '8px 10px',
  borderRadius: 6,
  border: `0.5px solid ${MAPPER_UI.inputBorder}`,
  background: MAPPER_UI.inputBg,
  color: MAPPER_UI.inputText,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const mapperScrollStyle: React.CSSProperties = {
  overflowY: 'scroll',
  overflowX: 'auto',
  scrollbarWidth: 'thin',
  scrollbarColor: 'rgba(148,163,184,0.55) rgba(30,41,59,0.85)',
};

function mapperStyles(layout: MapperLayout, inFlexWorkspace = false) {
  const full = layout === 'full';
  return {
    col: {
      flex: 1,
      minWidth: 0,
      maxHeight: full && inFlexWorkspace ? '100%' : full ? 'calc(100vh - 300px)' : 160,
      minHeight: full ? 200 : 120,
      height: full && inFlexWorkspace ? '100%' : undefined,
      ...mapperScrollStyle,
      border: '0.5px solid #2a2a3a',
      borderRadius: 8,
      padding: full ? 12 : 6,
      fontSize: full ? 13 : 9,
      color: MAPPER_UI.text,
    },
    colTitle: {
      fontWeight: 600,
      marginBottom: full ? 8 : 4,
      display: 'block' as const,
      fontSize: full ? 14 : 11,
      color: '#f3f4f6',
    },
    branchLabel: {
      color: '#d1d5db',
      fontSize: full ? 12 : 10,
    },
    hint: { fontSize: full ? 12 : 9, color: MAPPER_UI.textMuted, lineHeight: 1.5 },
    fileInput: { fontSize: full ? 12 : 9, width: '100%' },
    rulesList: {
      marginTop: 8,
      fontSize: full ? 11 : 8,
      color: '#9ca3af',
      maxHeight: full ? 120 : 48,
      overflowY: 'auto' as const,
    },
    preview: {
      marginTop: 10,
      fontSize: full ? 11 : 8,
      color: '#9ca3af',
      whiteSpace: 'pre-wrap' as const,
      maxHeight: full ? 220 : 120,
      ...mapperScrollStyle,
      background: '#0d0d14',
      padding: full ? 12 : 6,
      borderRadius: 6,
      lineHeight: 1.45,
    },
    row: (active: boolean, mapped: boolean) => ({
      display: 'block',
      width: '100%',
      textAlign: 'left' as const,
      padding: full ? '8px 10px' : '3px 6px',
      marginBottom: full ? 4 : 2,
      border: active ? '0.5px solid rgba(96,165,250,0.7)' : '0.5px solid transparent',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: full ? 14 : 10,
      fontFamily: 'inherit',
      background: active
        ? 'rgba(59,130,246,0.35)'
        : mapped
          ? 'rgba(16,185,129,0.2)'
          : 'transparent',
      color: active ? '#f8fafc' : mapped ? '#6ee7b7' : MAPPER_UI.text,
      WebkitTextFillColor: active ? '#f8fafc' : mapped ? '#6ee7b7' : MAPPER_UI.text,
    }),
  };
}

type TreeRow = {
  path:         string;
  label:        string;
  children?:    TreeRow[];
  fieldKind?:   TargetTreeNode['fieldKind'];
  idValuePath?: string;
  idTypeValue?: string;
};

function CollapsibleTree({
  nodes,
  depth,
  expanded,
  onToggle,
  selectedPath,
  selectedPaths,
  onSelectLeaf,
  isLeafPath,
  isMapped,
  isClickLocked,
  linkCount,
  layout,
  renderLeafExtra,
  onContextMenuLeaf,
}: {
  nodes:          TreeRow[];
  depth:          number;
  expanded:       Set<string>;
  onToggle:       (path: string) => void;
  selectedPath:    string | null;
  selectedPaths?:  Set<string>;
  onSelectLeaf:    (path: string, e: React.MouseEvent) => void;
  isLeafPath:     (path: string) => boolean;
  isMapped?:      (path: string) => boolean;
  isClickLocked?: (path: string) => boolean;
  linkCount?:     (path: string) => number;
  layout:         MapperLayout;
  renderLeafExtra?: (path: string) => React.ReactNode;
  onContextMenuLeaf?: (path: string, e: React.MouseEvent) => void;
}) {
  const s = mapperStyles(layout);
  const pad = depth * (layout === 'full' ? 14 : 8);

  return (
    <>
      {nodes.map(n => {
        const hasChildren = !!(n.children && n.children.length > 0);
        const isLeaf      = isLeafPath(n.path);
        const isOpen      = expanded.has(n.path);

        if (hasChildren) {
          const canMapValue = isLeafPath(n.path);
          const mapped      = isMapped?.(n.path) ?? false;
          const isIdBranch  = n.fieldKind === 'idBranch';
          return (
            <div key={n.path} style={{ paddingLeft: pad }}>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => onToggle(n.path)}
                  style={{
                    flex: '0 0 auto',
                    padding: layout === 'full' ? '8px 6px' : '3px 4px',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: layout === 'full' ? 12 : 9,
                    background: 'transparent',
                    color: '#e5e7eb',
                  }}
                  title={isOpen ? 'Collapse' : 'Expand'}
                >
                  {isOpen ? '▼' : '▶'}
                </button>
                {canMapValue ? (
                  <button
                    type="button"
                    style={{
                      ...s.row(
                        selectedPath === n.path || (selectedPaths?.has(n.path) ?? false),
                        mapped,
                      ),
                      flex: 1,
                      fontWeight: isIdBranch ? 600 : undefined,
                      cursor: isClickLocked?.(n.path) ? 'default' : 'pointer',
                      opacity: isClickLocked?.(n.path) ? 0.92 : 1,
                    }}
                    onClick={e => {
                      if (!isClickLocked?.(n.path)) onSelectLeaf(n.path, e);
                    }}
                    onContextMenu={onContextMenuLeaf
                      ? e => onContextMenuLeaf(n.path, e)
                      : undefined}
                    title={
                      isClickLocked?.(n.path)
                        ? 'Mapped — click or right-click to edit'
                        : isIdBranch
                          ? 'Map ID value (text)'
                          : undefined
                    }
                  >
                    {n.label}
                    {isIdBranch && (
                      <span style={{ marginLeft: 6, color: '#6b7280', fontSize: 10 }}>value</span>
                    )}
                    {renderLeafExtra?.(n.path)}
                  </button>
                ) : (
                  <span style={{
                    flex: 1,
                    padding: layout === 'full' ? '8px 10px' : '3px 6px',
                    fontWeight: 600,
                    color: '#d1d5db',
                    fontSize: layout === 'full' ? 14 : 10,
                  }}>
                    {n.label}
                  </span>
                )}
              </div>
              {isOpen && (
                <CollapsibleTree
                  nodes={n.children!}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  selectedPath={selectedPath}
                  selectedPaths={selectedPaths}
                  onSelectLeaf={onSelectLeaf}
                  isLeafPath={isLeafPath}
                  isMapped={isMapped}
                  isClickLocked={isClickLocked}
                  linkCount={linkCount}
                  layout={layout}
                  renderLeafExtra={renderLeafExtra}
                  onContextMenuLeaf={onContextMenuLeaf}
                />
              )}
            </div>
          );
        }

        const mapped = isMapped?.(n.path) ?? false;
        const links  = linkCount?.(n.path) ?? 0;
        const isTypeOption = n.fieldKind === 'idTypeOption';
        const isNoEnumsHint = n.fieldKind === 'idTypeMissing';
        const locked = isClickLocked?.(n.path) ?? false;
        const hintSelectPath = isNoEnumsHint ? n.idValuePath : n.path;
        const isSelected = !!(
          (hintSelectPath && (selectedPath === hintSelectPath || selectedPath === n.idValuePath))
          || selectedPaths?.has(n.path)
          || (n.idValuePath && selectedPaths?.has(n.idValuePath))
        );
        return (
          <div key={n.path} style={{ paddingLeft: pad }}>
            <button
              type="button"
              style={{
                ...s.row(isSelected, mapped),
                color: isTypeOption
                  ? (mapped ? '#e9d5ff' : '#ddd6fe')
                  : isNoEnumsHint
                    ? MAPPER_UI.accent
                    : MAPPER_UI.text,
                WebkitTextFillColor: isTypeOption
                  ? (mapped ? '#e9d5ff' : '#ddd6fe')
                  : isNoEnumsHint
                    ? MAPPER_UI.accent
                    : MAPPER_UI.text,
                cursor: isNoEnumsHint ? 'pointer' : locked ? 'default' : 'pointer',
                opacity: locked ? 0.92 : 1,
                fontSize: isNoEnumsHint ? (layout === 'full' ? 11 : 9) : undefined,
                lineHeight: 1.35,
              }}
              onClick={e => {
                if (isNoEnumsHint && n.idValuePath) {
                  onSelectLeaf(n.idValuePath, e);
                  return;
                }
                if (!locked) onSelectLeaf(n.path, e);
              }}
              onContextMenu={onContextMenuLeaf
                ? e => onContextMenuLeaf(n.path, e)
                : undefined}
              title={
                locked
                  ? 'Mapped — click or right-click to edit'
                  : isTypeOption && n.idTypeValue
                    ? `wd:type="${n.idTypeValue}"`
                    : undefined
              }
            >
              {n.label}
              {isTypeOption && (
                <span style={{ marginLeft: 6, color: '#c4b5fd', fontSize: layout === 'full' ? 11 : 9 }}>type</span>
              )}
              {links > 1 && (
                <span style={{ marginLeft: 6, color: '#4f8ef7', fontSize: 10 }}>×{links}</span>
              )}
              {renderLeafExtra?.(n.path)}
            </button>
          </div>
        );
      })}
    </>
  );
}

function TargetRuleEditor({
  targetPath,
  rule,
  onSave,
  onClear,
  onCancel,
  layout,
}: {
  targetPath: string;
  rule:       MappingRuleClient | undefined;
  onSave:     (rule: MappingRuleClient) => void;
  onClear:    () => void;
  onCancel:   () => void;
  layout:     MapperLayout;
}) {
  const [sourceType, setSourceType] = useState<MappingRuleClient['sourceType']>(
    rule?.sourceType ?? 'cStream',
  );
  const [sourceField, setSourceField] = useState(rule?.sourceField ?? '');
  const [literalValue, setLiteralValue] = useState(rule?.literalValue ?? '');
  const [exprError, setExprError] = useState<string | null>(null);

  useEffect(() => {
    setSourceType(rule?.sourceType ?? 'cStream');
    setSourceField(rule?.sourceField ?? '');
    setLiteralValue(rule?.literalValue ?? '');
    setExprError(null);
  }, [targetPath, rule]);

  const fs = layout === 'full' ? 12 : 10;
  const isExpression = sourceType === 'expression';
  const exprInvalid = isExpression && expressionSyntaxError(sourceField);

  const handleExprBlur = () => {
    if (!isExpression) {
      setExprError(null);
      return;
    }
    setExprError(expressionSyntaxError(sourceField));
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: MAPPER_UI.inputText, marginBottom: 8, fontFamily: 'monospace' }}>
        {targetPath}
      </div>
      <label style={{ fontSize: 10, color: MAPPER_UI.textMuted }}>Source</label>
      <select
        value={sourceType}
        onChange={e => {
          setSourceType(e.target.value as MappingRuleClient['sourceType']);
          setExprError(null);
        }}
        style={{ ...mapperFieldInput, fontSize: fs }}
      >
        <option value="cStream">cStream path</option>
        <option value="local">local path</option>
        <option value="global">global path</option>
        <option value="expression">Expression</option>
        <option value="literal">Static value</option>
      </select>
      {sourceType === 'literal' ? (
        <input
          value={literalValue}
          onChange={e => setLiteralValue(e.target.value)}
          placeholder="Static value"
          style={{ ...mapperFieldInput, fontSize: fs }}
        />
      ) : isExpression ? (
        <ExpressionInsertProvider>
          <div style={{
            display: 'flex',
            flexDirection: layout === 'full' ? 'row' : 'column',
            gap: 0,
            border: `0.5px solid ${MAPPER_UI.inputBorder}`,
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: layout === 'full' ? 260 : undefined,
          }}>
            <div style={{ flex: 1, padding: layout === 'full' ? 8 : 0, minWidth: 0 }}>
              <ExpressionTextarea
                value={sourceField}
                onChange={setSourceField}
                onBlur={handleExprBlur}
                placeholder="e.g. concat(cStream.name, ' — ', floRunMeta.runId)"
                rows={layout === 'full' ? 4 : 3}
                syntaxError={exprError ?? exprInvalid}
                showCursorPos={layout === 'full'}
                active
              />
            </div>
            <FunctionLibraryPanel layout={layout === 'full' ? 'sidebar' : 'stack'} width={layout === 'full' ? 198 : undefined} />
          </div>
        </ExpressionInsertProvider>
      ) : (
        <input
          value={sourceField}
          onChange={e => setSourceField(e.target.value)}
          placeholder={sourceType === 'cStream' ? 'e.g. salesItem.category' : 'dot.path'}
          style={{ ...mapperFieldInput, fontSize: fs, fontFamily: 'monospace' }}
        />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn
          variant="primary"
          disabled={Boolean(isExpression && (exprError || exprInvalid))}
          onClick={() => {
            if (isExpression) {
              const err = expressionSyntaxError(sourceField);
              if (err) {
                setExprError(err);
                return;
              }
            }
            onSave({
              targetField: targetPath,
              sourceType,
              ...(sourceType === 'literal'
                ? { literalValue }
                : { sourceField: sourceField.trim() }),
            });
          }}
        >
          Apply
        </Btn>
        <Btn variant="ghost" onClick={onClear} disabled={!rule}>Clear</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

function IdMappingEditor({
  idPath,
  typeField,
  typeEnumValues,
  valueRule,
  typeRule,
  fixedTypeToken,
  onSave,
  onClear,
  onCancel,
  layout,
}: {
  idPath:          string;
  typeField:         string | null;
  typeEnumValues?:  string[];
  valueRule?:       MappingRuleClient;
  typeRule?:        MappingRuleClient;
  fixedTypeToken?:  string;
  onSave:           (valueRule: MappingRuleClient, typeRule: MappingRuleClient) => void;
  onClear:          () => void;
  onCancel:         () => void;
  layout:           MapperLayout;
}) {
  const [sourceField, setSourceField] = useState(valueRule?.sourceField ?? '');
  const [typeValue, setTypeValue] = useState(
    fixedTypeToken ?? typeRule?.literalValue ?? typeEnumValues?.[0] ?? '',
  );

  useEffect(() => {
    setSourceField(valueRule?.sourceField ?? '');
    setTypeValue(fixedTypeToken ?? typeRule?.literalValue ?? typeEnumValues?.[0] ?? '');
  }, [idPath, valueRule, typeRule, typeEnumValues, fixedTypeToken]);

  const fs = layout === 'full' ? 12 : 10;
  const hasEnums = (typeEnumValues?.length ?? 0) > 0;
  const typeLocked = !!fixedTypeToken;

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: MAPPER_UI.inputText, marginBottom: 8, fontFamily: 'monospace' }}>
        {idPath}
      </div>
      {!hasEnums && (
        <p style={{ fontSize: 11, color: MAPPER_UI.accent, marginBottom: 10, lineHeight: 1.45 }}>
          Allowed wd:type values were not found in the uploaded schema. Enter the Workday type name below
          (e.g. Revenue_Category_ID).
        </p>
      )}
      <label style={{ fontSize: 10, color: MAPPER_UI.textMuted }}>wd:type</label>
      {typeLocked ? (
        <div style={{
          ...mapperFieldInput,
          fontSize: fs,
          fontFamily: 'monospace',
          padding: '6px 8px',
          color: '#ddd6fe',
        }}>
          {fixedTypeToken}
        </div>
      ) : hasEnums ? (
        <select
          value={typeValue}
          onChange={e => setTypeValue(e.target.value)}
          style={{ ...mapperFieldInput, fontSize: fs }}
        >
          {typeEnumValues!.map(ev => (
            <option key={ev} value={ev}>{ev}</option>
          ))}
        </select>
      ) : (
        <>
          <input
            list="workday-id-types"
            value={typeValue}
            onChange={e => setTypeValue(e.target.value)}
            placeholder="e.g. Revenue_Category_ID"
            style={{ ...mapperFieldInput, fontSize: fs, fontFamily: 'monospace' }}
          />
          <datalist id="workday-id-types">
            {WORKDAY_ID_TYPE_DATALIST.map(t => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </>
      )}
      <label style={{ fontSize: 10, color: MAPPER_UI.textMuted }}>ID value (cStream path)</label>
      <input
        value={sourceField}
        onChange={e => setSourceField(e.target.value)}
        placeholder="e.g. salesItem.revenueCategory"
        style={{ ...mapperFieldInput, fontSize: fs, fontFamily: 'monospace' }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn
          variant="primary"
          onClick={() => {
            if (!typeValue.trim()) return;
            if (typeLocked) {
              onSave(
                {
                  targetField: idPath,
                  sourceType:  'cStream',
                  sourceField: sourceField.trim(),
                },
                {
                  targetField: idPath,
                  sourceType:  'literal',
                  literalValue: typeValue.trim(),
                },
              );
              return;
            }
            if (!typeField) return;
            onSave(
              {
                targetField: idPath,
                sourceType:  'cStream',
                sourceField: sourceField.trim(),
              },
              {
                targetField: typeField,
                sourceType:  'literal',
                literalValue: typeValue.trim(),
              },
            );
          }}
        >
          Apply
        </Btn>
        <Btn variant="ghost" onClick={onClear} disabled={!valueRule && !typeRule}>Clear</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

/** Dot-path display: `..` reveals parents one step; ▶ full expand; ◀ collapse. */
function CollapsiblePath({
  path,
  color,
  fontSize = 10,
}: {
  path:      string;
  color:     string;
  fontSize?: number;
}) {
  const parts = path.split('.').filter(Boolean);
  const maxHidden = Math.max(0, parts.length - 1);
  const [hiddenPrefix, setHiddenPrefix] = useState(maxHidden);

  useEffect(() => {
    setHiddenPrefix(Math.max(0, parts.length - 1));
  }, [path, parts.length]);

  if (parts.length <= 1) {
    return (
      <span style={{ color, fontSize, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {path}
      </span>
    );
  }

  const visible = parts.slice(hiddenPrefix);
  const fullyExpanded = hiddenPrefix === 0;
  const fullyCollapsed = hiddenPrefix >= maxHidden;

  const pathBtn: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: fontSize + 1,
    fontFamily: 'inherit',
    lineHeight: 1.2,
  };

  const iconBtn: React.CSSProperties = {
    ...pathBtn,
    color: '#4f8ef7',
    fontSize: 9,
    marginLeft: 2,
  };

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 1,
      minWidth: 0,
      maxWidth: '100%',
      lineHeight: 1.35,
    }}>
      {hiddenPrefix > 0 && (
        <button
          type="button"
          style={pathBtn}
          title="Show parent segment"
          onClick={e => {
            e.stopPropagation();
            setHiddenPrefix(h => Math.max(0, h - 1));
          }}
        >
          ..
        </button>
      )}
      <span style={{ color, fontSize, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {visible.join('.')}
      </span>
      {!fullyExpanded && (
        <button
          type="button"
          style={iconBtn}
          title="Expand full path"
          onClick={e => {
            e.stopPropagation();
            setHiddenPrefix(0);
          }}
        >
          ▶
        </button>
      )}
      {fullyExpanded && !fullyCollapsed && (
        <>
          <button
            type="button"
            style={iconBtn}
            title="Hide one parent segment"
            onClick={e => {
              e.stopPropagation();
              setHiddenPrefix(h => Math.min(maxHidden, h + 1));
            }}
          >
            ..
          </button>
          <button
            type="button"
            style={iconBtn}
            title="Collapse to leaf only"
            onClick={e => {
              e.stopPropagation();
              setHiddenPrefix(maxHidden);
            }}
          >
            ◀
          </button>
        </>
      )}
    </div>
  );
}

type ContextMenuItem = {
  label:  string;
  action: () => void;
  danger?: boolean;
};

function MapperContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x:      number;
  y:      number;
  items:  ContextMenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const closeOnOutside = () => onClose();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('click', closeOnOutside);
    window.addEventListener('scroll', closeOnOutside, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('click', closeOnOutside);
      window.removeEventListener('scroll', closeOnOutside, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 10001,
        minWidth: 200,
        background: '#1a1f2e',
        border: '0.5px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px 6px 12px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 10, color: MAPPER_UI.textMuted, letterSpacing: '0.04em' }}>Target</span>
        <button
          type="button"
          aria-label="Close menu"
          title="Close (Esc)"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: MAPPER_UI.textMuted,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: 4 }}>
        {items.map(item => (
          <button
            key={item.label}
            type="button"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: item.danger ? '#f87171' : MAPPER_UI.text,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = item.danger
                ? 'rgba(248,113,113,0.12)'
                : 'rgba(79,142,247,0.12)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
            onClick={() => {
              item.action();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function MapperLayoutIconBtn({
  title,
  onClick,
  children,
  active,
}: {
  title:    string;
  onClick:  () => void;
  children: React.ReactNode;
  active?:  boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        border: active ? '0.5px solid rgba(79,142,247,0.55)' : '0.5px solid rgba(255,255,255,0.12)',
        background: active ? 'rgba(79,142,247,0.2)' : 'rgba(255,255,255,0.06)',
        color: active ? MAPPER_UI.accent : MAPPER_UI.textMuted,
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
        width: 32,
        height: 32,
        borderRadius: 6,
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function MappingEditorSheet({
  open,
  title,
  subtitle,
  onClose,
  layout,
  dock,
  width,
  onDockBottom,
  onDockLeft,
  onWiden,
  onRestoreWidth,
  children,
}: {
  open:            boolean;
  title:           string;
  subtitle?:       string;
  onClose:         () => void;
  layout:          MapperLayout;
  dock:            MapperEditorDock;
  width:           MapperEditorWidth;
  onDockBottom:    () => void;
  onDockLeft:      () => void;
  onWiden:         () => void;
  onRestoreWidth:  () => void;
  children:        React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const isLeft = layout === 'full' && dock === 'left';
  const canLayout = layout === 'full';

  return (
    <div style={{
      flexShrink: isLeft ? 0 : 0,
      flex: isLeft ? `0 0 ${LEFT_EDITOR_WIDTH[width]}` : undefined,
      alignSelf: isLeft ? 'stretch' : undefined,
      display: isLeft ? 'flex' : 'block',
      flexDirection: isLeft ? 'column' : undefined,
      minWidth: isLeft ? 280 : undefined,
      maxWidth: isLeft ? '85%' : undefined,
      marginTop: isLeft ? 0 : layout === 'full' ? 12 : 8,
      borderTop: isLeft ? undefined : '0.5px solid rgba(79,142,247,0.35)',
      borderRight: isLeft ? '0.5px solid rgba(79,142,247,0.35)' : undefined,
      background: 'rgba(79,142,247,0.06)',
      borderRadius: isLeft ? 8 : layout === 'full' ? '0 0 8px 8px' : 8,
      overflow: 'hidden',
      minHeight: isLeft ? 0 : undefined,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
        padding: layout === 'full' ? '12px 14px 0' : '10px 10px 0',
        flexShrink: 0,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: layout === 'full' ? 13 : 11, fontWeight: 600, color: MAPPER_UI.inputText }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 10, color: MAPPER_UI.textMuted, marginTop: 4, lineHeight: 1.45 }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {canLayout && (
            <>
              <MapperLayoutIconBtn
                title="Dock editor on left (wider workspace)"
                onClick={onDockLeft}
                active={dock === 'left'}
              >
                ◧
              </MapperLayoutIconBtn>
              <MapperLayoutIconBtn
                title="Dock editor at bottom (original)"
                onClick={onDockBottom}
                active={dock === 'bottom'}
              >
                ◫
              </MapperLayoutIconBtn>
              {dock === 'left' && (
                <>
                  <MapperLayoutIconBtn
                    title="Expand editor left (shrink trees)"
                    onClick={onWiden}
                    active={width !== 'normal'}
                  >
                    ◀
                  </MapperLayoutIconBtn>
                  <MapperLayoutIconBtn
                    title="Restore balanced split"
                    onClick={onRestoreWidth}
                    active={width === 'normal'}
                  >
                    ▣
                  </MapperLayoutIconBtn>
                </>
              )}
            </>
          )}
          <MapperLayoutIconBtn title="Close (Esc)" onClick={onClose}>
            ×
          </MapperLayoutIconBtn>
        </div>
      </div>
      <div
        className={MAPPER_SCROLL_CLASS}
        style={{
          padding: layout === 'full' ? '10px 14px 14px' : '8px 10px 10px',
          flex: isLeft ? 1 : undefined,
          minHeight: isLeft ? 0 : undefined,
          maxHeight: isLeft ? undefined : layout === 'full' ? 'min(42vh, 380px)' : 220,
          ...mapperScrollStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: '0.5px solid rgba(16,185,129,0.25)',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'rgba(0,0,0,0.72)',
  color: MAPPER_UI.text,
  colorScheme: 'dark',
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'center',
  padding: 16,
};

const modalShell: React.CSSProperties = {
  flex: 1,
  maxWidth: 1680,
  background: MAPPER_UI.panelBg,
  color: MAPPER_UI.text,
  colorScheme: 'dark',
  border: '0.5px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
};

const modalHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '0.5px solid rgba(255,255,255,0.08)',
  flexShrink: 0,
};

const modalBody: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  padding: '16px 18px 18px',
  color: MAPPER_UI.text,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

export const FloActionFieldMapper: React.FC<Props> = (props) => {
  const {
    functions,
    hubId,
    tenantId,
    connectorId,
    floKitId,
    actionId,
    connectionId,
    mappingRules,
    onRulesChange,
  } = props;

  const [mapperOpen, setMapperOpen]       = useState(false);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [targetError, setTargetError]     = useState('');
  const [targetMeta, setTargetMeta]       = useState<MappingTargetResponse | null>(null);
  const [sourceObj, setSourceObj]         = useState<Record<string, unknown> | null>(null);
  const [sampleError, setSampleError]     = useState('');
  const [pickSource, setPickSource]         = useState<string | null>(null);
  const [selectedTargetPath, setSelectedTargetPath] = useState<string | null>(null);
  const [selectedTargetPaths, setSelectedTargetPaths] = useState<Set<string>>(() => new Set());
  const [expandedPaths, setExpandedPaths]   = useState<Set<string>>(() => new Set());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewText, setPreviewText]       = useState('');
  const [mapperHint, setMapperHint] = useState('');
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);
  const [editorDock, setEditorDock] = useState<MapperEditorDock>('left');
  const [editorWidth, setEditorWidth] = useState<MapperEditorWidth>('wide');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const closeMappingEditor = useCallback(() => {
    setMappingEditorOpen(false);
    setSelectedTargetPath(null);
    setSelectedTargetPaths(new Set());
  }, []);

  const openMappingEditor = useCallback((valuePath: string) => {
    setSelectedTargetPaths(new Set());
    setSelectedTargetPath(valuePath);
    setMappingEditorOpen(true);
  }, []);

  const flashHint = useCallback((msg: string) => {
    setMapperHint(msg);
    window.setTimeout(() => setMapperHint(''), 2800);
  }, []);

  const sourceTree = useMemo(
    () => (sourceObj ? buildSourceTree(sourceObj) : []),
    [sourceObj],
  );

  const targetTree = targetMeta?.tree ?? [];

  const fieldByPath = useMemo(
    () => new Map((targetMeta?.fields ?? []).map(f => [f.path, f])),
    [targetMeta?.fields],
  );

  const sourceLinkCounts = useMemo(
    () => countRulesPerSource(mappingRules),
    [mappingRules],
  );

  const targetPathsWithRules = useMemo(
    () => new Set(mappingRules.map(r => r.targetField)),
    [mappingRules],
  );

  const isTargetMapped = useCallback((path: string) => {
    if (isWorkdayIdCompositePath(path)) {
      return targetPathsWithRules.has(path);
    }
    const m = path.match(/^(.+)\.@type\.([^.\s]+)$/);
    if (m) {
      const typeRule = getRuleForTarget(mappingRules, `${m[1]}.@type`);
      return typeRule?.sourceType === 'literal' && typeRule.literalValue === m[2];
    }
    return targetPathsWithRules.has(path);
  }, [mappingRules, targetPathsWithRules]);

  useEffect(() => {
    const next = new Set<string>();
    defaultExpandedPaths(sourceTree as TreeRow[], 1, 0, next);
    defaultExpandedPaths(targetTree as TreeRow[], 1, 0, next);
    const expandIdBranches = (nodes: TargetTreeNode[]) => {
      for (const n of nodes) {
        if (n.fieldKind === 'idBranch') next.add(n.path);
        if (n.children?.length) expandIdBranches(n.children);
      }
    };
    expandIdBranches(targetTree);
    setExpandedPaths(next);
  }, [sourceTree, targetTree]);

  const toggleExpanded = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isTargetLeaf = useCallback(
    (path: string) => {
      if (path.includes('.__type_unresolved__')) return false;
      if (isWorkdayIdCompositePath(path)) return true;
      return fieldByPath.has(path);
    },
    [fieldByPath],
  );

  const isSourceLeaf = useCallback(
    (path: string) => {
      const find = (nodes: SourceFieldNode[]): boolean => {
        for (const n of nodes) {
          if (n.path === path && (!n.children || n.children.length === 0)) return true;
          if (n.children && find(n.children)) return true;
        }
        return false;
      };
      return find(sourceTree);
    },
    [sourceTree],
  );

  const progress = useMemo(() => {
    if (!targetMeta?.fields) return null;
    return countMappedRequired(targetMeta.fields, mappingRules);
  }, [targetMeta, mappingRules]);

  const effectivelyRequired = useCallback((path: string) => {
    const f = fieldByPath.get(path);
    if (!f || !targetMeta?.fields) return false;
    const resolved: Record<string, unknown> = {};
    for (const r of mappingRules) {
      if (r.targetField) resolved[r.targetField] = r.literalValue ?? r.sourceField ?? true;
    }
    return isFieldEffectivelyRequired(f, targetMeta.fields, resolved, mappingRules);
  }, [fieldByPath, targetMeta, mappingRules]);

  const loadTarget = useCallback(async (forceRefresh = false) => {
    if (!connectorId || !floKitId || !actionId) return;
    setLoadingTarget(true);
    setTargetError('');
    try {
      const fn = httpsCallable<
        { connectorId: string; floKitId: string; actionId: string; forceRefresh?: boolean },
        MappingTargetResponse
      >(functions, 'resolveFloActionMappingTarget');
      const { data } = await fn({ connectorId, floKitId, actionId, forceRefresh });
      setTargetMeta(data);
    } catch (err: unknown) {
      setTargetError(err instanceof Error ? err.message : String(err));
      setTargetMeta(null);
    } finally {
      setLoadingTarget(false);
    }
  }, [functions, connectorId, floKitId, actionId]);

  useEffect(() => { loadTarget(); }, [loadTarget]);

  useEffect(() => {
    if (!mapperOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (contextMenu) {
        setContextMenu(null);
        e.stopPropagation();
        return;
      }
      if (mappingEditorOpen) {
        closeMappingEditor();
        e.stopPropagation();
        return;
      }
      if (pickSource) {
        setPickSource(null);
        return;
      }
      if (selectedTargetPaths.size > 0) {
        setSelectedTargetPaths(new Set());
        return;
      }
      if (selectedTargetPath) {
        setSelectedTargetPath(null);
        return;
      }
      setMapperOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    mapperOpen,
    contextMenu,
    mappingEditorOpen,
    closeMappingEditor,
    pickSource,
    selectedTargetPath,
    selectedTargetPaths,
  ]);

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

  const isTargetClickLocked = useCallback(
    (path: string) => hasMappingToTarget(mappingRules, resolveTargetValuePath(path)),
    [mappingRules],
  );

  const onSelectSource = (path: string, _e: React.MouseEvent) => {
    if (!isSourceLeaf(path)) return;

    const multiTargets = selectedTargetPaths.size > 0
      ? [...selectedTargetPaths]
      : selectedTargetPath
        ? [resolveTargetValuePath(selectedTargetPath)]
        : [];

    if (multiTargets.length > 0) {
      const { rules, wired } = wireSourceToTargets(mappingRules, path, multiTargets);
      if (wired > 0) {
        onRulesChange(rules);
        setSelectedTargetPaths(new Set());
        setSelectedTargetPath(null);
        flashHint(`Mapped "${path}" to ${wired} target(s).`);
      } else {
        flashHint('Selected targets are already mapped — pick other targets or right-click to remove.');
      }
      return;
    }

    if (pickSource === path) {
      setPickSource(null);
      return;
    }
    setPickSource(path);
  };

  const onSelectTarget = (path: string, e: React.MouseEvent) => {
    if (!isTargetLeaf(path)) return;
    if (path.includes('.__type_unresolved__')) return;

    const valuePath = resolveTargetValuePath(path);

    const multiSelect = e.ctrlKey || e.metaKey;

    if (multiSelect) {
      if (hasMappingToTarget(mappingRules, valuePath)) {
        flashHint('Target already mapped — right-click to remove before multi-select.');
        return;
      }
      setSelectedTargetPaths(prev => {
        const next = new Set(prev);
        if (next.has(valuePath)) next.delete(valuePath);
        else next.add(valuePath);
        return next;
      });
      setSelectedTargetPath(null);
      return;
    }

    setSelectedTargetPaths(new Set());

    if (hasMappingToTarget(mappingRules, valuePath)) {
      if (mappingEditorOpen && selectedTargetPath === valuePath) {
        closeMappingEditor();
        return;
      }
      openMappingEditor(valuePath);
      return;
    }

    if (isWorkdayIdCompositePath(valuePath)) {
      if (pickSource) {
        onRulesChange(upsertRule(mappingRules, {
          targetField: valuePath,
          sourceType:  'cStream',
          sourceField: pickSource,
        }));
        return;
      }
      if (mappingEditorOpen && selectedTargetPath === valuePath) {
        closeMappingEditor();
        return;
      }
      openMappingEditor(valuePath);
      return;
    }

    const idTypeMatch = path.match(/^(.+)\.@type\.([^.\s]+)$/);
    if (idTypeMatch) {
      const [, idPath, typeVal] = idTypeMatch;
      const typeField = `${idPath}.@type`;
      if (pickSource) {
        let rules = upsertRule(mappingRules, {
          targetField: typeField,
          sourceType:  'literal',
          literalValue: typeVal,
        });
        rules = upsertRule(rules, {
          targetField: idPath,
          sourceType:  'cStream',
          sourceField: pickSource,
        });
        onRulesChange(rules);
        return;
      }
      if (mappingEditorOpen && (selectedTargetPath === path || selectedTargetPath === idPath)) {
        closeMappingEditor();
        return;
      }
      onRulesChange(upsertRule(mappingRules, {
        targetField: typeField,
        sourceType:  'literal',
        literalValue: typeVal,
      }));
      openMappingEditor(idPath);
      return;
    }

    if (pickSource) {
      onRulesChange(upsertRule(mappingRules, {
        targetField: valuePath,
        sourceType:  'cStream',
        sourceField: pickSource,
      }));
      return;
    }
    if (mappingEditorOpen && (selectedTargetPath === path || selectedTargetPath === valuePath)) {
      closeMappingEditor();
      return;
    }
    openMappingEditor(valuePath);
  };

  const onContextMenuSource = (path: string, e: React.MouseEvent) => {
    if (!hasMappingFromSource(mappingRules, path)) return;
    e.preventDefault();
    e.stopPropagation();
    const n = countRulesForSource(mappingRules, path);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [{
        label: `Remove ${n} mapping(s) from this source`,
        danger: true,
        action: () => {
          onRulesChange(removeRulesForSource(mappingRules, path));
          if (pickSource === path) setPickSource(null);
        },
      }],
    });
  };

  const onContextMenuTarget = (path: string, e: React.MouseEvent) => {
    if (!isTargetLeaf(path) || path.includes('.__type_unresolved__')) return;
    const valuePath = resolveTargetValuePath(path);
    const mapped = hasMappingToTarget(mappingRules, valuePath);
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      {
        label: mapped ? 'Edit mapping…' : 'Add mapping…',
        action: () => openMappingEditor(
          isWorkdayIdCompositePath(valuePath) ? valuePath : valuePath,
        ),
      },
    ];
    if (mapped) {
      items.push({
        label: 'Remove mapping to this target',
        danger: true,
        action: () => {
          onRulesChange(removeMappingsForTarget(mappingRules, valuePath));
          if (
            selectedTargetPath === path
            || selectedTargetPath === valuePath
            || selectedTargetPath === `${valuePath}.@type`
          ) {
            closeMappingEditor();
          }
        },
      });
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const removeConnection = (targetField: string) => {
    const valuePath = resolveTargetValuePath(targetField);
    onRulesChange(removeMappingsForTarget(mappingRules, valuePath));
    if (
      selectedTargetPath === targetField
      || selectedTargetPath === valuePath
    ) {
      closeMappingEditor();
    }
  };

  const selectedRule = selectedTargetPath
    ? getRuleForTarget(mappingRules, selectedTargetPath)
    : undefined;

  const idMappingContext = useMemo(() => {
    if (!selectedTargetPath) return null;
    const composite = parseWorkdayIdCompositePath(selectedTargetPath);
    if (composite) {
      return {
        idPath:         composite.idPath,
        typeField:      null as string | null,
        typeEnumValues: [composite.typeToken],
        valueRule:      getRuleForTarget(mappingRules, composite.compositePath),
        typeRule:       undefined,
        fixedTypeToken: composite.typeToken,
      };
    }
    const idPath = selectedTargetPath.endsWith('.ID')
      ? selectedTargetPath
      : null;
    if (!idPath) return null;
    const typeField = `${idPath}.@type`;
    const typeMeta  = fieldByPath.get(typeField);
    return {
      idPath,
      typeField,
      typeEnumValues: typeMeta?.enumValues,
      valueRule: getRuleForTarget(mappingRules, idPath),
      typeRule:  getRuleForTarget(mappingRules, typeField),
      fixedTypeToken: undefined as string | undefined,
    };
  }, [selectedTargetPath, fieldByPath, mappingRules]);

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
        requestBody?: string;
        requestBodyInner?: string;
        contentType?: string;
        validationWouldFail?: boolean;
        unmappedRequired?: string[];
        mappedFieldCount?: number;
        schemaFieldCount?: number;
      } } };

      const dbg = data.debug;
      if (!dbg) {
        setPreviewText('No debug payload returned.');
        return;
      }
      const isXml = (dbg.contentType ?? '').toLowerCase().includes('xml')
        || (dbg.contentType ?? '').toLowerCase().includes('soap');
      const wireBody = (dbg.requestBody ?? dbg.requestBodyInner ?? '').slice(0, 12000);
      const innerBody = (dbg.requestBodyInner ?? '').slice(0, 8000);
      setPreviewText([
        dbg.validationWouldFail ? '⚠ Required fields still unmapped' : '✓ Required fields satisfied',
        `Mapping rules sent: ${mappingRules.length} · Mapped in request: ${dbg.mappedFieldCount ?? 0} · Schema fields: ${dbg.schemaFieldCount ?? 0}`,
        mappingRules.length > 10
          ? 'Tip: use Clear if Auto-map added too many rules — preview only uses your rule list.'
          : '',
        dbg.unmappedRequired?.length ? `Missing required: ${dbg.unmappedRequired.join(', ')}` : '',
        `Content-Type: ${dbg.contentType ?? 'application/json'}`,
        '',
        isXml
          ? '── Wire request (SOAP/XML as sent, incl. envelope when auth applies) ──'
          : '── Wire request (JSON as sent) ──',
        wireBody,
        isXml && innerBody && innerBody !== wireBody ? [
          '',
          '── SOAP Body payload only ──',
          innerBody,
        ].join('\n') : '',
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

  const cycleEditorWidth = useCallback(() => {
    setEditorWidth(w => (w === 'normal' ? 'wide' : w === 'wide' ? 'max' : 'normal'));
  }, []);

  const renderMapperBody = (layout: MapperLayout) => {
    const inFlexWorkspace = layout === 'full' && mappingEditorOpen && editorDock === 'left';
    const s = mapperStyles(layout, inFlexWorkspace);
    const editorOpen = mappingEditorOpen && !!selectedTargetPath;
    const useLeftDock = layout === 'full' && editorOpen && editorDock === 'left';
    const editorTitle = idMappingContext
      ? 'ID mapping'
      : selectedTargetPath
        ? (selectedRule ? 'Edit mapping' : 'Add mapping')
        : '';
    const editorSubtitle = selectedTargetPath && !idMappingContext
      ? 'cStream, local, global, expression, or static value — Esc or × to cancel'
      : idMappingContext
        ? 'wd:type and cStream value for Workday ID — Esc or × to cancel'
        : undefined;

    return (
      <div style={layout === 'full' ? {
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      } : undefined}>
        {loadingTarget && <div style={s.hint}>Loading target schema…</div>}
        {targetError && <span style={{ fontSize: layout === 'full' ? 13 : 9, color: '#ef4444' }}>{targetError}</span>}
        {targetMeta && (
          <div style={s.hint}>
            Target: <strong style={{ color: MAPPER_UI.text }}>{targetMeta.actionLabel}</strong>
            {' '}({targetMeta.schemaSource})
            {targetMeta.fromCache ? ' · cached' : ''}
            {progress ? ` · ${progress.mapped}/${progress.required} required mapped` : ''}
            {layout === 'full' && (
              <> · Fields under optional sections (e.g. Attachment) are not required unless you map that section.</>
            )}
          </div>
        )}

        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <input
            type="file"
            accept=".json,.xml,application/json,text/xml"
            onChange={onSampleFile}
            style={s.fileInput}
          />
          <div style={s.hint}>
            Pin a source, then click targets (same source → many targets). Or ⌘/Ctrl+click multiple targets, then click the source.
            Click or right-click a target → Add mapping opens the editor (left by default; use ◧/◫ to dock). Expand ◀ shrinks trees on the right. Right-click mapped targets to edit or remove.
          </div>
          {mapperHint && (
            <span style={{
              display: 'block',
              marginTop: 6,
              fontSize: layout === 'full' ? 12 : 9,
              color: '#fbbf24',
            }}>
              {mapperHint}
            </span>
          )}
          {sampleError && (
            <span style={{ color: '#ef4444', fontSize: layout === 'full' ? 12 : 9, display: 'block' }}>
              {sampleError}
            </span>
          )}
        </div>

        {(pickSource || (mappingEditorOpen && selectedTargetPath) || selectedTargetPaths.size > 0) && (
          <span style={{ ...s.hint, color: '#4f8ef7', marginBottom: 8, display: 'block' }}>
            {pickSource
              ? `Source "${pickSource}" pinned — click targets to wire (repeat for multiple targets)`
              : selectedTargetPaths.size > 0
                ? `${selectedTargetPaths.size} target(s) selected — click a source to wire all`
                : mappingEditorOpen && selectedTargetPath
                  ? `Mapping editor open for "${selectedTargetPath}"`
                  : null}
          </span>
        )}

        <div style={{
          display: 'flex',
          gap: layout === 'full' ? 12 : 6,
          flex: layout === 'full' ? 1 : undefined,
          minHeight: layout === 'full' ? 0 : 280,
          alignItems: 'stretch',
          minWidth: 0,
          overflow: 'hidden',
        }}>
          {useLeftDock && (
            <MappingEditorSheet
              open={editorOpen}
              title={editorTitle}
              subtitle={editorSubtitle}
              onClose={closeMappingEditor}
              layout={layout}
              dock={editorDock}
              width={editorWidth}
              onDockLeft={() => setEditorDock('left')}
              onDockBottom={() => setEditorDock('bottom')}
              onWiden={cycleEditorWidth}
              onRestoreWidth={() => setEditorWidth('normal')}
            >
              {idMappingContext ? (
                <IdMappingEditor
                  idPath={idMappingContext.fixedTypeToken && selectedTargetPath
                    ? selectedTargetPath
                    : idMappingContext.idPath}
                  typeField={idMappingContext.typeField}
                  typeEnumValues={idMappingContext.typeEnumValues}
                  valueRule={idMappingContext.valueRule}
                  typeRule={idMappingContext.typeRule}
                  fixedTypeToken={idMappingContext.fixedTypeToken}
                  layout={layout}
                  onSave={(valueRule, typeRule) => {
                    if (idMappingContext.fixedTypeToken && selectedTargetPath) {
                      onRulesChange(upsertRule(mappingRules, {
                        ...valueRule,
                        targetField: selectedTargetPath,
                      }));
                    } else {
                      let rules = upsertRule(mappingRules, typeRule);
                      rules = upsertRule(rules, valueRule);
                      onRulesChange(rules);
                    }
                    closeMappingEditor();
                  }}
                  onClear={() => {
                    onRulesChange(
                      removeMappingsForTarget(
                        mappingRules,
                        selectedTargetPath ?? idMappingContext.idPath,
                      ),
                    );
                  }}
                  onCancel={closeMappingEditor}
                />
              ) : selectedTargetPath ? (
                <TargetRuleEditor
                  targetPath={selectedTargetPath}
                  rule={selectedRule}
                  layout={layout}
                  onSave={rule => {
                    onRulesChange(upsertRule(mappingRules, rule));
                    closeMappingEditor();
                  }}
                  onClear={() => {
                    onRulesChange(removeMappingsForTarget(mappingRules, selectedTargetPath));
                  }}
                  onCancel={closeMappingEditor}
                />
              ) : null}
            </MappingEditorSheet>
          )}

          <div style={{
            display: 'flex',
            gap: layout === 'full' ? 12 : 6,
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            alignItems: 'stretch',
          }}>
          <div className={MAPPER_SCROLL_CLASS} style={{ ...s.col, flex: 1 }}>
            <span style={{ ...s.colTitle, color: '#6ee7b7' }}>Your data (source)</span>
            <span style={{ display: 'block', fontSize: layout === 'full' ? 11 : 9, color: '#9ca3af', marginBottom: 6 }}>
              Right-click mapped source to remove all its connections
            </span>
            {sourceTree.length === 0 ? (
              <span style={{ color: MAPPER_UI.textMuted }}>Upload a sample file</span>
            ) : (
              <CollapsibleTree
                nodes={sourceTree}
                depth={0}
                expanded={expandedPaths}
                onToggle={toggleExpanded}
                selectedPath={pickSource}
                onSelectLeaf={onSelectSource}
                isLeafPath={isSourceLeaf}
                isMapped={p => sourceLinkCounts.has(p)}
                linkCount={p => sourceLinkCounts.get(p) ?? 0}
                layout={layout}
                onContextMenuLeaf={onContextMenuSource}
              />
            )}
          </div>

          <div
            className={MAPPER_SCROLL_CLASS}
            style={{
              ...s.col,
              flex: layout === 'full'
                ? (useLeftDock ? '0 0 200px' : '0 0 300px')
                : '0 0 130px',
              maxHeight: inFlexWorkspace ? '100%' : layout === 'full' ? 'calc(100vh - 300px)' : 160,
              background: 'rgba(16,185,129,0.04)',
            }}
          >
            <span style={{ ...s.colTitle, color: '#6ee7b7' }}>Connections</span>
            <span style={{ display: 'block', fontSize: layout === 'full' ? 11 : 9, color: '#9ca3af', marginBottom: 6 }}>
              Click a card to edit · right-click to remove
            </span>
            {mappingRules.length === 0 ? (
              <span style={{ color: MAPPER_UI.textMuted, fontSize: layout === 'full' ? 12 : 10 }}>
                No mappings yet
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                {mappingRules.map(r => (
                  <button
                    key={r.targetField}
                    type="button"
                    onClick={() => {
                      const vp = resolveTargetValuePath(r.targetField);
                      const editPath = r.targetField.endsWith('.ID') || isWorkdayIdCompositePath(r.targetField)
                        ? r.targetField
                        : vp;
                      if (mappingEditorOpen && selectedTargetPath === editPath) {
                        closeMappingEditor();
                      } else {
                        openMappingEditor(editPath);
                      }
                    }}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      const vp = resolveTargetValuePath(r.targetField);
                      const editPath = r.targetField.endsWith('.ID') || isWorkdayIdCompositePath(r.targetField)
                        ? r.targetField
                        : vp;
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        items: [
                          { label: 'Edit mapping…', action: () => openMappingEditor(editPath) },
                          {
                            label: 'Remove this connection',
                            danger: true,
                            action: () => removeConnection(r.targetField),
                          },
                        ],
                      });
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '8px 8px',
                      borderRadius: 6,
                      border: mappingEditorOpen && (
                        selectedTargetPath === r.targetField
                        || selectedTargetPath === resolveTargetValuePath(r.targetField)
                      )
                        ? '0.5px solid rgba(79,142,247,0.5)'
                        : '0.5px solid rgba(255,255,255,0.06)',
                      background: mappingEditorOpen && (
                        selectedTargetPath === r.targetField
                        || selectedTargetPath === resolveTargetValuePath(r.targetField)
                      )
                        ? 'rgba(79,142,247,0.15)'
                        : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      minWidth: 0,
                      maxWidth: '100%',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ minWidth: 0, maxWidth: '100%' }}>
                      {r.sourceType === 'literal' ? (
                        <span style={{ fontSize: 10, color: '#10b981', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {formatRuleSource(r)}
                        </span>
                      ) : (
                        <CollapsiblePath
                          path={r.sourceField ?? formatRuleSource(r)}
                          color="#6ee7b7"
                          fontSize={layout === 'full' ? 11 : 9}
                        />
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', margin: '4px 0' }}>───▶</div>
                    <div style={{ minWidth: 0, maxWidth: '100%' }}>
                      <CollapsiblePath
                        path={r.targetField}
                        color="#fcd34d"
                        fontSize={layout === 'full' ? 11 : 9}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={MAPPER_SCROLL_CLASS} style={{ ...s.col, flex: useLeftDock ? 1 : 1.1 }}>
            <span style={{ ...s.colTitle, color: '#fcd34d' }}>Action needs (target)</span>
            <span style={{ display: 'block', fontSize: layout === 'full' ? 11 : 9, color: '#9ca3af', marginBottom: 6 }}>
              Right-click any field — Add mapping or Remove
            </span>
            {!targetTree.length ? (
              <span style={{ color: MAPPER_UI.textMuted }}>Loading…</span>
            ) : (
              <CollapsibleTree
                nodes={targetTree}
                depth={0}
                expanded={expandedPaths}
                onToggle={toggleExpanded}
                selectedPath={selectedTargetPath}
                selectedPaths={selectedTargetPaths}
                onSelectLeaf={onSelectTarget}
                isLeafPath={isTargetLeaf}
                isMapped={isTargetMapped}
                isClickLocked={isTargetClickLocked}
                layout={layout}
                onContextMenuLeaf={onContextMenuTarget}
                renderLeafExtra={path => {
                  const f = fieldByPath.get(path);
                  if (!f) return null;
                  const isTypeOpt = isWorkdayIdCompositePath(path) || /\.@type\.[^.]+$/.test(path);
                  const composite = parseWorkdayIdCompositePath(path);
                  return (
                    <>
                      {effectivelyRequired(path) && !isTypeOpt && <span style={{ color: '#ef4444' }}> *</span>}
                      {isTypeOpt && (
                        <span style={{ color: '#ddd6fe', fontSize: layout === 'full' ? 11 : 9 }}>
                          {composite ? ` wd:type="${composite.typeToken}"` : ' wd:type'}
                        </span>
                      )}
                    </>
                  );
                }}
              />
            )}
          </div>
          </div>
        </div>

        {!useLeftDock && (
        <MappingEditorSheet
          open={editorOpen}
          title={editorTitle}
          subtitle={editorSubtitle}
          onClose={closeMappingEditor}
          layout={layout}
          dock={editorDock}
          width={editorWidth}
          onDockLeft={() => setEditorDock('left')}
          onDockBottom={() => setEditorDock('bottom')}
          onWiden={cycleEditorWidth}
          onRestoreWidth={() => setEditorWidth('normal')}
        >
          {idMappingContext ? (
            <IdMappingEditor
              idPath={idMappingContext.fixedTypeToken && selectedTargetPath
                ? selectedTargetPath
                : idMappingContext.idPath}
              typeField={idMappingContext.typeField}
              typeEnumValues={idMappingContext.typeEnumValues}
              valueRule={idMappingContext.valueRule}
              typeRule={idMappingContext.typeRule}
              fixedTypeToken={idMappingContext.fixedTypeToken}
              layout={layout}
              onSave={(valueRule, typeRule) => {
                if (idMappingContext.fixedTypeToken && selectedTargetPath) {
                  onRulesChange(upsertRule(mappingRules, {
                    ...valueRule,
                    targetField: selectedTargetPath,
                  }));
                } else {
                  let rules = upsertRule(mappingRules, typeRule);
                  rules = upsertRule(rules, valueRule);
                  onRulesChange(rules);
                }
                closeMappingEditor();
              }}
              onClear={() => {
                onRulesChange(
                  removeMappingsForTarget(
                    mappingRules,
                    selectedTargetPath ?? idMappingContext.idPath,
                  ),
                );
              }}
              onCancel={closeMappingEditor}
            />
          ) : selectedTargetPath ? (
            <TargetRuleEditor
              targetPath={selectedTargetPath}
              rule={selectedRule}
              layout={layout}
              onSave={rule => {
                onRulesChange(upsertRule(mappingRules, rule));
                closeMappingEditor();
              }}
              onClear={() => {
                onRulesChange(removeMappingsForTarget(mappingRules, selectedTargetPath));
              }}
              onCancel={closeMappingEditor}
            />
          ) : null}
        </MappingEditorSheet>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
          <Btn variant="ghost" onClick={onAutoMap} disabled={!sourceObj || !targetMeta}>Auto-map</Btn>
          <Btn variant="ghost" onClick={onPreviewRequest} disabled={previewLoading || !sourceObj}>
            {previewLoading ? 'Preview…' : 'Preview request'}
          </Btn>
          <Btn variant="ghost" onClick={() => onRulesChange([])} disabled={!mappingRules.length}>Clear mappings</Btn>
          {layout === 'full' && (
            <Btn variant="ghost" onClick={() => loadTarget(true)} disabled={loadingTarget}>
              Reload mapping index
            </Btn>
          )}
        </div>

        {previewText && <pre className={MAPPER_SCROLL_CLASS} style={s.preview}>{previewText}</pre>}
      </div>
    );
  };

  const mapperScrollbarCss = `
    .${MAPPER_SCROLL_CLASS} {
      overflow-y: scroll;
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(148,163,184,0.6) rgba(30,41,59,0.95);
    }
    .${MAPPER_SCROLL_CLASS}::-webkit-scrollbar {
      width: 11px;
      height: 11px;
    }
    .${MAPPER_SCROLL_CLASS}::-webkit-scrollbar-track {
      background: rgba(30,41,59,0.95);
      border-radius: 6px;
    }
    .${MAPPER_SCROLL_CLASS}::-webkit-scrollbar-thumb {
      background: rgba(148,163,184,0.55);
      border-radius: 6px;
      border: 2px solid rgba(30,41,59,0.95);
    }
    .${MAPPER_SCROLL_CLASS}::-webkit-scrollbar-thumb:hover {
      background: rgba(191,219,254,0.75);
    }
  `;

  const modal = mapperOpen ? createPortal(
    <div
      style={modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Field mapper"
      onClick={e => { if (e.target === e.currentTarget) setMapperOpen(false); }}
    >
      <style>{mapperScrollbarCss}</style>
      <div style={modalShell} onClick={e => e.stopPropagation()}>
        <div style={modalHeader}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: MAPPER_UI.inputText }}>Field mapper</div>
            <div style={{ fontSize: 12, color: MAPPER_UI.textMuted, marginTop: 2 }}>
              {targetMeta?.actionLabel ?? actionId}
              {progress ? ` · ${progress.mapped}/${progress.required} required` : ''}
              {mappingRules.length > 0 ? ` · ${mappingRules.length} rule(s)` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: MAPPER_UI.textMuted }}>
              Mappings apply on Apply — use designer Save to persist the flo
            </span>
            <Btn variant="ghost" onClick={() => {
              closeMappingEditor();
              setContextMenu(null);
              setMapperOpen(false);
            }}>Close</Btn>
          </div>
        </div>
        <div style={modalBody}>
          {renderMapperBody('full')}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div style={panelStyle}>
        <Field label="Field mapping">
          {loadingTarget && <Help>Loading…</Help>}
          {targetError && <span style={{ fontSize: 10, color: '#ef4444' }}>{targetError}</span>}
          {targetMeta && progress && (
            <Help>
              {progress.mapped}/{progress.required} required mapped
              {mappingRules.length > 0 ? ` · ${mappingRules.length} mapping rule(s)` : ''}
            </Help>
          )}
          <div style={{ marginTop: 8 }}>
            <Btn variant="primary" onClick={() => setMapperOpen(true)}>
              Open field mapper
            </Btn>
          </div>
          <div style={{ marginTop: 6 }}><Help>
            Full-screen mapper: right-click targets for Add mapping; editor panel stays visible at the bottom (Esc to cancel).
          </Help></div>
        </Field>
      </div>
      {contextMenu && (
        <MapperContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
      {modal}
    </>
  );
};
