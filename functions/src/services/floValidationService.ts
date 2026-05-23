/**
 * Flo validation — publish gate, resource checks, scheduled revalidation.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  HUB_COLLECTIONS,
  validateFloGraph,
  getDraftGraph,
  getPublishedGraph,
  type FloValidationResourceContext,
  type FloValidationReport,
  type FloNode,
  type FloEdge,
} from '@floplug/shared';
import { db } from '../utils/firebase.js';
import {
  persistValidationEvent,
  upsertFloInvalidAlert,
  resolveFloInvalidAlert,
  listFloAlerts,
} from './floExecutionHubService.js';
import { sendEmail } from './emailService.js';
import { commitFloPublish, resolveDraftGraph } from './floPublishService.js';

function tenantCol(hubId: string, tenantId: string) {
  return db.collection(COLLECTIONS.HUBS).doc(hubId).collection(HUB_COLLECTIONS.TENANTS).doc(tenantId);
}

function requireAuth(request: { auth?: unknown }): void {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
}

function requireSameHub(
  request: { auth?: { token?: Record<string, unknown> } },
  hubId: string,
  tenantId: string,
): void {
  const token = request.auth?.token ?? {};
  if (token.hubId !== hubId || token.tenantId !== tenantId) {
    throw new HttpsError('permission-denied', 'Token hub/tenant mismatch.');
  }
}

export async function loadValidationResources(
  hubId: string,
  tenantId: string,
): Promise<FloValidationResourceContext> {
  const base = tenantCol(hubId, tenantId);

  const [plugsSnap, connSnap, floIds] = await Promise.all([
    base.collection(HUB_COLLECTIONS.PLUGS).get(),
    base.collection(HUB_COLLECTIONS.FLO_CONNECTIONS).get(),
    collectAllFloIds(hubId, tenantId),
  ]);

  const plugIds = new Set<string>();
  const activePlugIds = new Set<string>();
  const plugConnectionPolicy: Record<string, { allowedConnectionIds: string[]; defaultConnectionId?: string }> = {};
  for (const d of plugsSnap.docs) {
    plugIds.add(d.id);
    const data = d.data() as Record<string, unknown>;
    if (data.isActive !== false) activePlugIds.add(d.id);
    const allowed = Array.isArray(data.allowedConnectionIds)
      ? (data.allowedConnectionIds as string[])
      : (data.connectionId ? [String(data.connectionId)] : []);
    plugConnectionPolicy[d.id] = {
      allowedConnectionIds: allowed,
      defaultConnectionId:  String(data.defaultConnectionId ?? data.connectionId ?? '') || undefined,
    };
  }

  const connectionIds = new Set<string>();
  const activeConnectionIds = new Set<string>();
  for (const d of connSnap.docs) {
    connectionIds.add(d.id);
    if (d.data().isActive !== false) activeConnectionIds.add(d.id);
  }

  const publishedFloIds = new Set<string>();
  for (const { floId, status } of floIds) {
    if (status === 'active') publishedFloIds.add(floId);
  }

  return {
    plugIds,
    activePlugIds,
    connectionIds,
    activeConnectionIds,
    floIds: new Set(floIds.map(f => f.floId)),
    publishedFloIds,
    plugConnectionPolicy,
  };
}

async function collectAllFloIds(
  hubId: string,
  tenantId: string,
): Promise<{ floId: string; workspaceId: string; status: string }[]> {
  const out: { floId: string; workspaceId: string; status: string }[] = [];
  const wsSnap = await tenantCol(hubId, tenantId).collection(HUB_COLLECTIONS.WORKSPACES).get();
  for (const ws of wsSnap.docs) {
    const fSnap = await ws.ref.collection(HUB_COLLECTIONS.FLOS).get();
    for (const f of fSnap.docs) {
      const d = f.data();
      out.push({
        floId:       f.id,
        workspaceId: ws.id,
        status:      String(d.status ?? 'idle'),
      });
    }
  }
  return out;
}

export function deriveValidationStatus(
  report: FloValidationReport,
): 'valid' | 'invalid' | 'warnings' {
  if (report.errors.length > 0) return 'invalid';
  if (report.warnings.length > 0) return 'warnings';
  return 'valid';
}

export async function validateFloDocument(
  hubId: string,
  tenantId: string,
  _workspaceId: string,
  floId: string,
  floData: Record<string, unknown>,
  checkResources: boolean,
  /** When true, validate published graph (revalidation / runtime). Default: draft. */
  usePublishedGraph = false,
): Promise<FloValidationReport> {
  const graph = usePublishedGraph
    ? getPublishedGraph(floData)
    : getDraftGraph(floData);
  if (!graph) {
    return {
      validatedAt: new Date().toISOString(),
      nodeSnapshots: [],
      errors: [{
        nodeId: floId,
        nodeType: 'flo',
        nodeLabel: String(floData.name ?? floId),
        field: 'published',
        code: 'REQUIRED_FIELD_MISSING',
        severity: 'error',
        message: 'No published graph — publish this flo first.',
      }],
      warnings: [],
      infos: [],
      canSave: false,
      canPublish: false,
      canRunProduction: false,
    };
  }
  const nodes = graph.nodes as FloNode[];
  const edges = graph.edges as FloEdge[];
  const resources = checkResources
    ? await loadValidationResources(hubId, tenantId)
    : undefined;

  return validateFloGraph({
    floId,
    floName:        String(floData.name ?? floId),
    nodes,
    edges,
    resources,
    checkResources,
  });
}

async function applyValidationToFloDoc(
  hubId: string,
  tenantId: string,
  workspaceId: string,
  floId: string,
  floData: Record<string, unknown>,
  report: FloValidationReport,
  opts: {
    publishState:     'draft' | 'published';
    validationStatus: 'valid' | 'invalid' | 'warnings';
    setPublished?:    boolean;
  },
): Promise<void> {
  const floRef = tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.WORKSPACES).doc(workspaceId)
    .collection(HUB_COLLECTIONS.FLOS).doc(floId);

  const status = opts.validationStatus === 'invalid'
    ? 'invalid'
    : (opts.setPublished && opts.validationStatus === 'valid' ? 'active' : String(floData.status ?? 'idle'));

  await floRef.set({
    validationStatus:       opts.validationStatus,
    validationErrorCount:   report.errors.length,
    validationWarningCount: report.warnings.length,
    lastValidatedAt:        report.validatedAt,
    publishState:           opts.publishState,
    status,
    ...(opts.setPublished && opts.validationStatus === 'valid'
      ? { publishedAt: FieldValue.serverTimestamp() }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await persistValidationEvent({
    hubId,
    tenantId,
    workspaceId,
    floId,
    floName:          String(floData.name ?? floId),
    report,
    publishState:     opts.publishState,
    validationStatus: opts.validationStatus,
    trigger:          opts.setPublished ? 'publish' : 'manual',
  });

  const floName = String(floData.name ?? floId);
  if (opts.validationStatus === 'invalid') {
    await upsertFloInvalidAlert({ hubId, tenantId, workspaceId, floId, floName, report });
    await notifyAdminsFloInvalidated(hubId, tenantId, floName, report);
  } else if (opts.publishState === 'published') {
    await resolveFloInvalidAlert(hubId, tenantId, floId);
  }
}

async function notifyAdminsFloInvalidated(
  hubId: string,
  tenantId: string,
  floName: string,
  report: FloValidationReport,
): Promise<void> {
  try {
    const usersSnap = await tenantCol(hubId, tenantId)
      .collection(HUB_COLLECTIONS.USERS)
      .where('isActive', '==', true)
      .get();

    const admins = usersSnap.docs.filter(d => {
      const role = String(d.data().role ?? '');
      return role === 'hub_admin' || d.data().isHubAdmin === true;
    });

    const lines = report.errors.slice(0, 5).map(e => `• ${e.nodeLabel}: ${e.message}`);
    const body = [
      `Flo "${floName}" was marked invalid and will not run via webhook or scheduler.`,
      '',
      ...lines,
      report.errors.length > 5 ? `…and ${report.errors.length - 5} more.` : '',
      '',
      'Open FloExecution Hub → Alerts to review.',
    ].join('\n');

    for (const admin of admins) {
      const email = String(admin.data().email ?? '');
      if (!email) continue;
      await sendEmail({
        hubId,
        toAddress: email,
        subject:   `[FloPlug] Flo invalidated: ${floName}`,
        emailBody: body,
        purpose:   'SYSTEM_NOTIFICATION',
      });
    }
  } catch (err) {
    console.error('[floValidation] admin notify failed:', err);
  }
}

/** Callable — validate flo (optionally with resource existence checks). */
export const validateFlo = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, floId, nodes, edges, checkResources = true } =
    request.data as {
      hubId: string; tenantId: string; workspaceId: string; floId: string;
      nodes: FloNode[]; edges: FloEdge[];
      checkResources?: boolean;
    };

  if (!hubId || !tenantId || !floId) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId, floId required.');
  }
  requireSameHub(request, hubId, tenantId);

  const resources = checkResources
    ? await loadValidationResources(hubId, tenantId)
    : undefined;

  const report = validateFloGraph({
    floId,
    nodes: nodes ?? [],
    edges: edges ?? [],
    resources,
    checkResources,
  });

  return { report, validationStatus: deriveValidationStatus(report) };
});

/** Callable — publish flo after full validation; blocks on errors. */
export const publishFlo = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, workspaceId, floId, nodes, edges } = request.data as {
    hubId: string; tenantId: string; workspaceId: string; floId: string;
    nodes?: FloNode[]; edges?: FloEdge[];
  };

  if (!hubId || !tenantId || !workspaceId || !floId) {
    throw new HttpsError('invalid-argument', 'hubId, tenantId, workspaceId, floId required.');
  }
  requireSameHub(request, hubId, tenantId);

  const floRef = tenantCol(hubId, tenantId)
    .collection(HUB_COLLECTIONS.WORKSPACES).doc(workspaceId)
    .collection(HUB_COLLECTIONS.FLOS).doc(floId);

  const floSnap = await floRef.get();
  if (!floSnap.exists) throw new HttpsError('not-found', `Flo ${floId} not found.`);

  const floData = floSnap.data() as Record<string, unknown>;
  const { nodes: useNodes, edges: useEdges } = resolveDraftGraph(floData, nodes, edges);

  const report = await validateFloGraph({
    floId,
    floName: String(floData.name ?? floId),
    nodes: useNodes,
    edges: useEdges,
    resources: await loadValidationResources(hubId, tenantId),
    checkResources: true,
  });

  const validationStatus = deriveValidationStatus(report);
  if (!report.canPublish) {
    await applyValidationToFloDoc(hubId, tenantId, workspaceId, floId, floData, report, {
      publishState: 'draft',
      validationStatus,
      setPublished: false,
    });
    throw new HttpsError(
      'failed-precondition',
      `Cannot publish: ${report.errors.length} validation error(s).`,
      { report, validationStatus },
    );
  }

  const { publishedVersion, graphHash } = await commitFloPublish({
    hubId,
    tenantId,
    workspaceId,
    floId,
    floData,
    draftNodes: useNodes,
    draftEdges: useEdges,
    report,
    publishedBy: request.auth!.uid,
  });

  await applyValidationToFloDoc(hubId, tenantId, workspaceId, floId, floData, report, {
    publishState:     'published',
    validationStatus,
    setPublished:     true,
  });

  return {
    ok: true,
    report,
    validationStatus,
    status: 'active',
    publishedVersion,
    graphHash,
  };
});

/** List alerts for hub Alerts tab. */
export const getFloAlerts = onCall(async (request) => {
  requireAuth(request);
  const { hubId, tenantId, includeResolved } = request.data as {
    hubId: string; tenantId: string; includeResolved?: boolean;
  };
  requireSameHub(request, hubId, tenantId);
  const alerts = await listFloAlerts(hubId, tenantId, includeResolved === true);
  return { alerts };
});

/** Scheduled revalidation — mark published flos invalid when refs drift. */
export const revalidateHubFlosScheduled = onSchedule(
  { schedule: 'every 6 hours', timeZone: 'UTC' },
  async () => {
    const hubsSnap = await db.collection(COLLECTIONS.HUBS).get();
    for (const hub of hubsSnap.docs) {
      const tenantsSnap = await hub.ref.collection(HUB_COLLECTIONS.TENANTS).get();
      for (const tenant of tenantsSnap.docs) {
        try {
          await revalidateTenantFlos(hub.id, tenant.id);
        } catch (err) {
          console.error(`[revalidate] ${hub.id}/${tenant.id}:`, err);
        }
      }
    }
  },
);

export async function revalidateTenantFlos(hubId: string, tenantId: string): Promise<void> {
  const floList = await collectAllFloIds(hubId, tenantId);
  for (const { floId, workspaceId, status } of floList) {
    const isPublished = status === 'active' || status === 'invalid';
    if (!isPublished) continue;

    const floRef = tenantCol(hubId, tenantId)
      .collection(HUB_COLLECTIONS.WORKSPACES).doc(workspaceId)
      .collection(HUB_COLLECTIONS.FLOS).doc(floId);
    const snap = await floRef.get();
    if (!snap.exists) continue;

    const floData = snap.data() as Record<string, unknown>;
    if (!getPublishedGraph(floData)) continue;

    const report = await validateFloDocument(
      hubId, tenantId, workspaceId, floId, floData, true, true,
    );
    const validationStatus = deriveValidationStatus(report);
    const publishState = (floData.publishState as string) === 'published' ? 'published' : 'published';

    await applyValidationToFloDoc(hubId, tenantId, workspaceId, floId, floData, report, {
      publishState: publishState as 'published',
      validationStatus,
      setPublished: false,
    });
  }
}

/** Returns human-readable block reason, or null if flo may run in production. */
export function getFloRunnableBlockReason(
  floDoc: Record<string, unknown>,
  floId: string,
): string | null {
  const status = String(floDoc.status ?? 'idle');
  const validationStatus = String(floDoc.validationStatus ?? 'unknown');
  const publishState = String(floDoc.publishState ?? '');

  if (status !== 'active' && publishState !== 'published') {
    return `Flo ${floId} is not published (status=${status}). Publish before webhook/scheduler invoke.`;
  }
  if (validationStatus === 'invalid') {
    return `Flo ${floId} is invalid. Fix validation errors in Alerts before running.`;
  }
  const published = getPublishedGraph(floDoc);
  if (!published?.nodes?.length) {
    return `Flo ${floId} has no published graph. Publish from the designer before webhook/scheduler invoke.`;
  }
  return null;
}

/** Gate production invoke — callable / internal. */
export async function assertFloRunnable(
  _hubId: string,
  _tenantId: string,
  floDoc: Record<string, unknown>,
  floId: string,
): Promise<void> {
  const reason = getFloRunnableBlockReason(floDoc, floId);
  if (reason) throw new HttpsError('failed-precondition', reason);
}
