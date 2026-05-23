/**
 * Publish draft → published + version archive.
 */

import { FieldValue } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  HUB_COLLECTIONS,
  computeGraphHash,
  getDraftGraph,
  getPublishedGraph,
  type FloEdge,
  type FloNode,
  type FloValidationReport,
} from '@floplug/shared';
import { db } from '../utils/firebase.js';

function floRef(hubId: string, tenantId: string, workspaceId: string, floId: string) {
  return db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.WORKSPACES).doc(workspaceId)
    .collection(HUB_COLLECTIONS.FLOS).doc(floId);
}

function versionRef(hubId: string, tenantId: string, workspaceId: string, floId: string, version: number) {
  return floRef(hubId, tenantId, workspaceId, floId)
    .collection(HUB_COLLECTIONS.FLO_VERSIONS).doc(String(version));
}

export interface PublishFloInput {
  hubId:        string;
  tenantId:     string;
  workspaceId:  string;
  floId:        string;
  floData:      Record<string, unknown>;
  draftNodes:   FloNode[];
  draftEdges:   FloEdge[];
  report:       FloValidationReport;
  publishedBy:  string;
}

export interface PublishFloResult {
  publishedVersion: number;
  graphHash:          string;
}

/** Promote draft to published; archive prior published snapshot under Versions/. */
export async function commitFloPublish(input: PublishFloInput): Promise<PublishFloResult> {
  const {
    hubId, tenantId, workspaceId, floId, floData,
    draftNodes, draftEdges, report, publishedBy,
  } = input;

  const draftGraph = {
    nodes:    draftNodes,
    edges:    draftEdges,
    viewport: (floData.draft as { viewport?: unknown } | undefined)?.viewport
      ?? floData.viewport,
  } as { nodes: FloNode[]; edges: FloEdge[]; viewport?: { x: number; y: number; zoom: number } };

  const currentVersion = Number(floData.publishedVersion ?? 0);
  const existingPublished = getPublishedGraph(floData);

  if (currentVersion > 0 && existingPublished) {
    const prevVersionRef = versionRef(hubId, tenantId, workspaceId, floId, currentVersion);
    const prevSnap = await prevVersionRef.get();
    if (!prevSnap.exists) {
      await prevVersionRef.set({
        version:     currentVersion,
        floId,
        workspaceId,
        graph:       existingPublished,
        publishedBy: String(floData.publishedByUid ?? floData.lastPublishedBy ?? 'unknown'),
        publishedAt: floData.publishedAt ?? FieldValue.serverTimestamp(),
        graphHash:   String(floData.publishedGraphHash ?? computeGraphHash(existingPublished)),
      });
    }
  }

  const newVersion     = currentVersion + 1;
  const publishedGraph = {
    nodes:    draftNodes,
    edges:    draftEdges,
    viewport: draftGraph.viewport,
  };
  const graphHash = computeGraphHash(publishedGraph);

  const batch = db.batch();
  const fRef  = floRef(hubId, tenantId, workspaceId, floId);
  const vRef  = versionRef(hubId, tenantId, workspaceId, floId, newVersion);

  batch.set(vRef, {
    version:     newVersion,
    floId,
    workspaceId,
    graph:       publishedGraph,
    validationReport: report,
    publishedBy,
    publishedAt: FieldValue.serverTimestamp(),
    graphHash,
  });

  batch.set(fRef, {
    draft:                  draftGraph,
    published:              publishedGraph,
    publishedVersion:       newVersion,
    publishedGraphHash:     graphHash,
    draftGraphHash:         graphHash,
    hasUnpublishedChanges:  false,
    publishedByUid:         publishedBy,
  }, { merge: true });

  await batch.commit();

  return { publishedVersion: newVersion, graphHash };
}

/** Build draft graph from request body or stored flo doc. */
export function resolveDraftGraph(
  floData: Record<string, unknown>,
  nodes?: FloNode[],
  edges?: FloEdge[],
): { nodes: FloNode[]; edges: FloEdge[] } {
  if (nodes?.length) return { nodes, edges: edges ?? [] };
  const draft = getDraftGraph(floData);
  return { nodes: draft.nodes as FloNode[], edges: draft.edges as FloEdge[] };
}
