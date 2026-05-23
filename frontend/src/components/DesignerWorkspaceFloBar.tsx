import React, { useState } from 'react';
import type { DeveloperWorkspace } from '../hooks/useDeveloperWorkspaces';
import type { FloMeta } from '@floplug/shared';

const btnSm: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 500,
  border: '0.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
  color: '#c0c0cc', cursor: 'pointer', fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 5,
  border: '0.5px solid rgba(255,255,255,.15)',
  background: '#0f1117', color: '#ffffff',
  fontSize: 12, fontFamily: 'inherit', maxWidth: 180, outline: 'none',
};

const badge: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: '#fbbf24',
  background: 'rgba(251,191,36,0.12)', border: '0.5px solid rgba(251,191,36,0.35)',
  borderRadius: 4, padding: '1px 5px', marginLeft: 4,
};

export interface DesignerWorkspaceFloBarProps {
  workspaces: DeveloperWorkspace[];
  activeWorkspace: DeveloperWorkspace | null;
  onWorkspaceChange: (wsId: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onRenameWorkspace: (wsId: string, name: string) => Promise<void>;
  onSetDefaultWorkspace: (wsId: string) => Promise<void>;
  flos: FloMeta[];
  activeFlo: FloMeta | null;
  onFloChange: (floId: string) => void;
  onSetDefaultFlo: (floId: string) => Promise<void>;
  onMoveFlo: (targetWorkspaceId: string) => Promise<void>;
  onNewFlo: () => void;
}

export const DesignerWorkspaceFloBar: React.FC<DesignerWorkspaceFloBarProps> = ({
  workspaces, activeWorkspace, onWorkspaceChange,
  onCreateWorkspace, onRenameWorkspace, onSetDefaultWorkspace,
  flos, activeFlo, onFloChange, onSetDefaultFlo, onMoveFlo, onNewFlo,
}) => {
  const [wsActionMsg, setWsActionMsg] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);

  const otherWorkspaces = workspaces.filter(ws => ws.id !== activeWorkspace?.id);

  const run = async (fn: () => Promise<void>) => {
    setWsActionMsg('');
    try {
      await fn();
    } catch (err: unknown) {
      setWsActionMsg(err instanceof Error ? err.message : String(err));
      setTimeout(() => setWsActionMsg(''), 3000);
    }
  };

  const promptNewWorkspace = () => {
    const name = window.prompt('New workspace name', '');
    if (name?.trim()) run(() => onCreateWorkspace(name.trim()));
  };

  const promptRenameWorkspace = () => {
    if (!activeWorkspace) return;
    const name = window.prompt('Rename workspace', activeWorkspace.workspaceName);
    if (name?.trim() && name.trim() !== activeWorkspace.workspaceName) {
      run(() => onRenameWorkspace(activeWorkspace.id, name.trim()));
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {/* Workspace */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <select
          value={activeWorkspace?.id ?? ''}
          onChange={e => onWorkspaceChange(e.target.value)}
          style={{ ...selectStyle, maxWidth: 160 }}
          title="Switch workspace"
        >
          {workspaces.length === 0 && (
            <option value="" disabled>No workspaces</option>
          )}
          {workspaces.map(ws => (
            <option key={ws.id} value={ws.id}>
              {ws.isUserDefault ? '★ ' : ''}{ws.workspaceName}
            </option>
          ))}
        </select>
        <button type="button" style={btnSm} title="New workspace" onClick={promptNewWorkspace}>+ WS</button>
        <button type="button" style={btnSm} title="Rename workspace" onClick={promptRenameWorkspace} disabled={!activeWorkspace}>✎</button>
        <button
          type="button"
          style={{ ...btnSm, color: activeWorkspace?.isUserDefault ? '#fbbf24' : undefined }}
          title="Set as your default workspace"
          disabled={!activeWorkspace}
          onClick={() => activeWorkspace && run(() => onSetDefaultWorkspace(activeWorkspace.id))}
        >
          ★ Default WS
        </button>
      </div>

      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />

      {/* Flo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <select
          value={activeFlo?.id ?? ''}
          onChange={e => onFloChange(e.target.value)}
          style={selectStyle}
          disabled={!activeWorkspace}
          title="Switch flo in this workspace"
        >
          <option value="" disabled>
            {flos.length === 0 ? 'No flos yet…' : 'Select flo…'}
          </option>
          {flos.map(f => (
            <option key={f.id} value={f.id}>
              {f.defaultToLoad ? '★ ' : ''}{f.name}
            </option>
          ))}
        </select>
        {activeFlo?.defaultToLoad && <span style={badge}>WS DEFAULT</span>}
        <button type="button" style={btnSm} onClick={onNewFlo} disabled={!activeWorkspace}>+ Flo</button>
        <button
          type="button"
          style={{ ...btnSm, color: activeFlo?.defaultToLoad ? '#fbbf24' : undefined }}
          title="Open this flo when entering the workspace"
          disabled={!activeFlo || activeFlo.defaultToLoad}
          onClick={() => activeFlo && run(() => onSetDefaultFlo(activeFlo.id))}
        >
          ★ Default flo
        </button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={btnSm}
            title="Move this flo to another workspace"
            disabled={!activeFlo || otherWorkspaces.length === 0}
            onClick={() => setMoveOpen(o => !o)}
          >
            ⇄ Move
          </button>
          {moveOpen && otherWorkspaces.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999,
              background: '#181b24', border: '0.5px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            }}>
              <div style={{ fontSize: 9, color: '#6b6b80', padding: '4px 8px', fontWeight: 600 }}>
                Move to workspace
              </div>
              {otherWorkspaces.map(ws => (
                <button
                  key={ws.id}
                  type="button"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 10px', border: 'none', background: 'transparent',
                    color: '#e0e0e8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    borderRadius: 4,
                  }}
                  onClick={() => {
                    setMoveOpen(false);
                    run(async () => {
                      await onMoveFlo(ws.id);
                    });
                  }}
                >
                  {ws.workspaceName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {wsActionMsg && (
        <span style={{ fontSize: 10, color: '#f87171', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {wsActionMsg}
        </span>
      )}
    </div>
  );
};

export default DesignerWorkspaceFloBar;
