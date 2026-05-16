/**
 * ConnectorNodes — canvas cards only; configuration in right-panel inspector.
 */
import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { CompactNode, deriveNodeStatus, outputTargetBadge } from './CompactNode';

const card = (
  id: string, data: Record<string, unknown>, selected: boolean,
  color: string, icon: string, title: string, subtitle: string,
) => (
  <CompactNode
    id={id}
    selected={!!selected}
    color={color}
    icon={icon}
    title={title}
    subtitle={subtitle}
    badge={outputTargetBadge(data)}
    status={deriveNodeStatus(data)}
    onDelete={() => (data.onDelete as (nid: string) => void)?.(id)}
  />
);

export const SalesforceNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  return card(id, d, !!selected, '#00a1e0', 'SF', 'Salesforce',
    `${d.sfObject ?? 'Contact'} · ${d.operation ?? 'Query'}`);
};

export const SapNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  return card(id, d, !!selected, '#0052cc', 'S', 'SAP S/4HANA',
    `${d.sapModule ?? 'FI'} · ${d.action ?? 'READ_BAPI'}`);
};

export const OracleNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  return card(id, d, !!selected, '#e07b39', 'O', 'Oracle EBS', String(d.action ?? 'QUERY'));
};

export const MapperNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const n = ((d.mappings as string[]) ?? []).length;
  return card(id, d, !!selected, '#7c3aed', 'M', 'Field Mapper', `${n} mapping${n === 1 ? '' : 's'} · ${d.mapMode ?? 'pure'}`);
};

export const FilterNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const d = data as Record<string, unknown>;
  const field = String(d.field ?? 'field');
  const op = String(d.operator ?? '==');
  return card(id, d, !!selected, '#0f766e', 'F', 'Filter', `${field} ${op} ${d.value ?? '…'}`);
};
