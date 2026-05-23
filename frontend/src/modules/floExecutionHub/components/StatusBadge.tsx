import React from 'react';
import { normalizeRunStatus, statusLabel } from '../utils/formatters';

export const StatusDot: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`status-dot ${normalizeRunStatus(status)}`} />
);

export const StatusPill: React.FC<{ status?: string }> = ({ status }) => {
  const kind = normalizeRunStatus(status);
  return <span className={`pill ${kind}`}>{statusLabel(status)}</span>;
};
