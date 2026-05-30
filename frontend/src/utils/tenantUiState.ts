/**
 * Persist tenant UI navigation + canvas session state across page refresh.
 * Scoped per hub + tenant so multi-tenant users don't cross-contaminate.
 */

export type TenantViewId = 'designer' | 'executions' | 'admin' | 'scheduler';

export type AdminTabId =
  | 'plugs'
  | 'users'
  | 'scheduler'
  | 'keys'
  | 'alerts'
  | 'connections'
  | 'actions';

export interface TenantUiState {
  view?: TenantViewId;
  adminTab?: AdminTabId;
  executionsTab?: 'monitor' | 'alerts';
  executionsMonitorView?: 'dashboard' | 'pulse';
  activeWorkspaceId?: string;
  activeFloId?: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface InspectorPanelPrefs {
  visible: boolean;
  width:   number;
}

export const INSPECTOR_PANEL_WIDTH_DEFAULT = 300;
export const INSPECTOR_PANEL_WIDTH_MIN     = 260;
export const INSPECTOR_PANEL_WIDTH_MAX     = 520;

const VALID_VIEWS = new Set<TenantViewId>(['designer', 'executions', 'admin', 'scheduler']);

function storageKey(hubId: string, tenantId: string): string {
  return `fp_tenant_ui:${hubId}:${tenantId}`;
}

function canvasViewportKey(
  hubId: string,
  tenantId: string,
  workspaceId: string,
  floId: string,
): string {
  return `fp_canvas_viewport:${hubId}:${tenantId}:${workspaceId}:${floId}`;
}

function inspectorPanelKey(hubId: string, tenantId: string): string {
  return `fp_inspector_panel:${hubId}:${tenantId}`;
}

export function readTenantUiState(hubId: string, tenantId: string): TenantUiState {
  try {
    const raw = localStorage.getItem(storageKey(hubId, tenantId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TenantUiState;
    if (parsed.view && !VALID_VIEWS.has(parsed.view)) {
      parsed.view = 'designer';
    }
    return parsed;
  } catch {
    return {};
  }
}

export function writeTenantUiState(
  hubId: string,
  tenantId: string,
  patch: Partial<TenantUiState>,
): void {
  try {
    const prev = readTenantUiState(hubId, tenantId);
    localStorage.setItem(storageKey(hubId, tenantId), JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readCanvasViewport(
  hubId: string,
  tenantId: string,
  workspaceId: string,
  floId: string,
): CanvasViewport | null {
  try {
    const raw = localStorage.getItem(canvasViewportKey(hubId, tenantId, workspaceId, floId));
    if (!raw) return null;
    const vp = JSON.parse(raw) as CanvasViewport;
    if (typeof vp.x === 'number' && typeof vp.y === 'number' && typeof vp.zoom === 'number') {
      return vp;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCanvasViewport(
  hubId: string,
  tenantId: string,
  workspaceId: string,
  floId: string,
  viewport: CanvasViewport,
): void {
  try {
    localStorage.setItem(
      canvasViewportKey(hubId, tenantId, workspaceId, floId),
      JSON.stringify(viewport),
    );
  } catch {
    /* ignore */
  }
}

export function readInspectorPanelPrefs(
  hubId: string,
  tenantId: string,
): InspectorPanelPrefs {
  try {
    const raw = localStorage.getItem(inspectorPanelKey(hubId, tenantId));
    if (!raw) {
      return { visible: true, width: INSPECTOR_PANEL_WIDTH_DEFAULT };
    }
    const p = JSON.parse(raw) as InspectorPanelPrefs;
    const width = typeof p.width === 'number'
      ? Math.min(INSPECTOR_PANEL_WIDTH_MAX, Math.max(INSPECTOR_PANEL_WIDTH_MIN, p.width))
      : INSPECTOR_PANEL_WIDTH_DEFAULT;
    return { visible: p.visible !== false, width };
  } catch {
    return { visible: true, width: INSPECTOR_PANEL_WIDTH_DEFAULT };
  }
}

export function writeInspectorPanelPrefs(
  hubId: string,
  tenantId: string,
  patch: Partial<InspectorPanelPrefs>,
): void {
  try {
    const prev = readInspectorPanelPrefs(hubId, tenantId);
    localStorage.setItem(
      inspectorPanelKey(hubId, tenantId),
      JSON.stringify({ ...prev, ...patch }),
    );
  } catch {
    /* ignore */
  }
}
