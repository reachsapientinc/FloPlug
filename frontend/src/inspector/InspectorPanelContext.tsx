/**
 * Inspector panel width — expands within Designer body (never over node palette / bars).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react';
import {
  readInspectorPanelPrefs,
  writeInspectorPanelPrefs,
  INSPECTOR_PANEL_WIDTH_DEFAULT,
  INSPECTOR_PANEL_WIDTH_MIN,
  INSPECTOR_PANEL_WIDTH_MAX,
} from '../utils/tenantUiState';

export const INSPECTOR_WIDTH_COMPACT = INSPECTOR_PANEL_WIDTH_DEFAULT;
/** Minimum canvas width when inspector is expanded. */
export const DESIGNER_CANVAS_MIN_WIDTH = 260;
/** Minimum inspector width when expanded (widen mode). */
export const INSPECTOR_WIDTH_EXPANDED_MIN = 420;

export const INSPECTOR_COLLAPSED_STRIP_WIDTH = 28;

type InspectorPanelContextValue = {
  expanded:       boolean;
  setExpanded:    (v: boolean) => void;
  toggleExpanded: () => void;
  paletteWidth:   number;
  visible:        boolean;
  setVisible:     (v: boolean) => void;
  toggleVisible:  () => void;
  panelWidth:     number;
  setPanelWidth:  (w: number) => void;
  hubId:          string;
  tenantId:       string;
};

const InspectorPanelContext = createContext<InspectorPanelContextValue | null>(null);

export const InspectorPanelProvider: React.FC<{
  expanded:       boolean;
  setExpanded:    (v: boolean) => void;
  paletteWidth:   number;
  hubId:          string;
  tenantId:       string;
  children:       React.ReactNode;
}> = ({ expanded, setExpanded, paletteWidth, hubId, tenantId, children }) => {
  const [prefs, setPrefs] = useState(() => readInspectorPanelPrefs(hubId, tenantId));

  useEffect(() => {
    setPrefs(readInspectorPanelPrefs(hubId, tenantId));
  }, [hubId, tenantId]);

  const setVisible = useCallback((visible: boolean) => {
    setPrefs(prev => {
      const next = { ...prev, visible };
      writeInspectorPanelPrefs(hubId, tenantId, { visible });
      return next;
    });
  }, [hubId, tenantId]);

  const toggleVisible = useCallback(() => {
    setPrefs(prev => {
      const visible = !prev.visible;
      writeInspectorPanelPrefs(hubId, tenantId, { visible });
      return { ...prev, visible };
    });
  }, [hubId, tenantId]);

  const setPanelWidth = useCallback((width: number) => {
    const w = Math.min(INSPECTOR_PANEL_WIDTH_MAX, Math.max(INSPECTOR_PANEL_WIDTH_MIN, width));
    setPrefs(prev => {
      writeInspectorPanelPrefs(hubId, tenantId, { width: w });
      return { ...prev, width: w };
    });
  }, [hubId, tenantId]);

  const toggleExpanded = useCallback(() => setExpanded(!expanded), [expanded, setExpanded]);

  const value = useMemo(
    () => ({
      expanded,
      setExpanded,
      toggleExpanded,
      paletteWidth,
      visible: prefs.visible,
      setVisible,
      toggleVisible,
      panelWidth: prefs.width,
      setPanelWidth,
      hubId,
      tenantId,
    }),
    [
      expanded, setExpanded, toggleExpanded, paletteWidth,
      prefs.visible, prefs.width, setVisible, toggleVisible, setPanelWidth,
      hubId, tenantId,
    ],
  );

  return (
    <InspectorPanelContext.Provider value={value}>
      {children}
    </InspectorPanelContext.Provider>
  );
};

export function useInspectorPanel(): InspectorPanelContextValue {
  const ctx = useContext(InspectorPanelContext);
  if (!ctx) {
    throw new Error('useInspectorPanel must be used within InspectorPanelProvider');
  }
  return ctx;
}

/** Optional hook for components that may render outside provider (FloAction sidebar). */
export function useInspectorPanelOptional(): InspectorPanelContextValue | null {
  return useContext(InspectorPanelContext);
}

export function inspectorPanelStyle(
  expanded: boolean,
  paletteWidth: number,
  visible: boolean,
  panelWidth: number,
): React.CSSProperties {
  if (!visible) {
    return {
      width: INSPECTOR_COLLAPSED_STRIP_WIDTH,
      flexShrink: 0,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#141720',
      borderLeft: '0.5px solid rgba(255,255,255,.06)',
      overflow: 'hidden',
    };
  }

  const base: React.CSSProperties = {
    background: '#141720',
    borderLeft: '0.5px solid rgba(255,255,255,.06)',
    display: 'flex',
    flexDirection: 'row',
    flexShrink: 0,
    overflow: 'hidden',
    minHeight: 0,
  };

  if (!expanded) {
    return { ...base, width: panelWidth + 6, flexGrow: 0 };
  }

  return {
    ...base,
    flex: '1 1 480px',
    minWidth: INSPECTOR_WIDTH_EXPANDED_MIN,
    maxWidth: `calc(100% - ${paletteWidth}px - ${DESIGNER_CANVAS_MIN_WIDTH}px)`,
    width: undefined,
  };
}
