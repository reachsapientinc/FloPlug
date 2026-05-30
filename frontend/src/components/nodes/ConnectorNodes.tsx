/**
 * ConnectorNodes — canvas cards only; configuration in right-panel inspector.
 */
import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { nodeDisplayTitle } from '@floplug/shared';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';
import { nodeDimensions } from './FlowNodeShell';

const card = (
  id: string,
  data: Record<string, unknown>,
  selected: boolean,
  color: string,
  icon: string,
  title: string,
  subtitle: string,
  dims: { width: number; height: number },
) => (
  <CompactNode
    id={id}
    selected={selected}
    color={color}
    icon={icon}
    title={nodeDisplayTitle(data, title)}
    subtitle={subtitle}
    badge={outputTargetBadge(data)}
    status={deriveNodeStatus(data)}
    width={dims.width}
    height={dims.height}
    onDelete={() => (data.onDelete as (nid: string) => void)?.(id)}
  />
);

type DimProps = Pick<NodeProps, 'width' | 'height' | 'measured'>;

export const SalesforceNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  return card(id, d, !!selected, '#00a1e0', 'SF', 'Salesforce',
    `${d.sfObject ?? 'Contact'} · ${d.operation ?? 'Query'}`, nodeDimensions(dimProps));
};

export const SapNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  return card(id, d, !!selected, '#0052cc', 'S', 'SAP S/4HANA',
    `${d.sapModule ?? 'FI'} · ${d.action ?? 'READ_BAPI'}`, nodeDimensions(dimProps));
};

export const OracleNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  return card(id, d, !!selected, '#e07b39', 'O', 'Oracle EBS', String(d.action ?? 'QUERY'), nodeDimensions(dimProps));
};

export const MapperNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.mappings as string[]) ?? []).length;
  return card(id, d, !!selected, '#7c3aed', 'M', 'Field Mapper', `${n} mapping${n === 1 ? '' : 's'} · ${d.mapMode ?? 'pure'}`, nodeDimensions(dimProps));
};

export const FilterNode: React.FC<NodeProps> = ({ id, data, selected, ...dimProps }) => {
  const d = data as Record<string, unknown>;
  const op = String(d.operator ?? '==');
  const rowCount = (d.conditionRows as unknown[] | undefined)?.length ?? 0;
  const summary = op === 'expression'
    ? `expr: ${String(d.value ?? '…').slice(0, 28)}`
    : rowCount > 0
      ? `${rowCount} condition row${rowCount === 1 ? '' : 's'}`
      : `${String(d.field ?? 'field').slice(0, 14)} ${op} ${String(d.value ?? '…').slice(0, 14)}`;
  return card(id, d, !!selected, '#0f766e', 'F', 'Filter', summary, nodeDimensions(dimProps));
};
