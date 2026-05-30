/**
 * Right inspector column: drag-to-resize (compact), collapse strip, inner content.
 */

import React, { useCallback, useRef } from 'react';
import {
  useInspectorPanel,
  inspectorPanelStyle,
  INSPECTOR_COLLAPSED_STRIP_WIDTH,
} from './InspectorPanelContext';

export const InspectorRightColumn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    visible, toggleVisible, panelWidth, setPanelWidth, expanded, paletteWidth,
  } = useInspectorPanel();
  const dragging = useRef(false);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    if (expanded || !visible) return;
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = panelWidth;

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const delta = startX - ev.clientX;
      setPanelWidth(startW + delta);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [expanded, visible, panelWidth, setPanelWidth]);

  if (!visible) {
    return (
      <div
        style={{
          width: INSPECTOR_COLLAPSED_STRIP_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: '#141720',
          borderLeft: '0.5px solid rgba(255,255,255,.06)',
        }}
      >
        <button
          type="button"
          onClick={toggleVisible}
          title="Show inspector panel"
          aria-label="Show inspector panel"
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            background: 'transparent',
            color: '#9090a8',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
            padding: 0,
          }}
        >
          ‹
        </button>
      </div>
    );
  }

  const outerStyle = inspectorPanelStyle(expanded, paletteWidth, true, panelWidth);

  return (
    <div style={outerStyle}>
      {!expanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize · double-click to hide panel"
          onPointerDown={onResizePointerDown}
          onDoubleClick={toggleVisible}
          style={{
            width: 6,
            flexShrink: 0,
            cursor: 'col-resize',
            background: 'rgba(255,255,255,0.04)',
            borderRight: '0.5px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            width: 2,
            height: 32,
            borderRadius: 1,
            background: 'rgba(255,255,255,0.2)',
          }} />
        </div>
      )}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
};
