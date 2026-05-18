/**
 * emailNode.ts
 *
 * Changes in this version:
 *  1. loadSmtpCredentials — new helper that mirrors plugNode's credential
 *     priority: nd.connectionId (canvas pick) > plug.connectionId > inline plug.credentials
 *  2. loadSmtpPlug renamed to loadSmtpPlugConfig (loads non-credential fields).
 *  3. All other behaviour unchanged (emailBindings, output target, attachment logic).
 *
 * Credential resolution priority:
 *   1. nd.connectionId   — developer picked a specific connection on the canvas
 *   2. plug.connectionId — plug's admin-configured default FloConnection
 *   3. plug.credentials  — legacy inline SMTP credentials
 */

import nodemailer                                             from 'nodemailer';
import { getFirestore }                                      from 'firebase-admin/firestore';
import { COLLECTIONS, HUB_COLLECTIONS }                     from '@floplug/shared';
import { resolveToString, wrapMessage, type ResolveContext } from './cStreamMeta.js';
import type { FloConnectionDoc }                             from '@floplug/shared';

// ── Address parser ─────────────────────────────────────────────────────────────
function parseAddresses(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ── SMTP credentials shape ────────────────────────────────────────────────────
interface SmtpCredentials {
  host:      string;
  port:      number;
  secure:    boolean;
  user:      string;
  password:  string;
  fromEmail: string;
  fromName?: string;
}

// ── Load the plug config (non-credential fields) ──────────────────────────────
async function loadSmtpPlugConfig(
  hubId: string, tenantId: string, plugId: string,
): Promise<{ nodeType: string; authProtocol: string; connectionId?: string; credentials?: Record<string, string> }> {
  const snap = await getFirestore()
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS).doc(plugId)
    .get();
  if (!snap.exists) throw new Error(`EmailPlug not found: ${plugId}`);
  const d = snap.data() as any;
  if (d.nodeType !== 'emailNode' && d.authProtocol !== 'smtp_basic') {
    throw new Error(`Plug ${plugId} is not an email plug (nodeType=${d.nodeType})`);
  }
  return d;
}

// ── Load SMTP credentials from FloConnection or inline ────────────────────────
async function loadSmtpCredentials(
  hubId:           string,
  tenantId:        string,
  plugId:          string,
  nodeConnectionId?: string,
): Promise<SmtpCredentials> {
  const plugConfig = await loadSmtpPlugConfig(hubId, tenantId, plugId);
  const effectiveConnectionId = nodeConnectionId || plugConfig.connectionId;

  let rawCreds: Record<string, string>;

  if (effectiveConnectionId) {
    console.log(`[emailNode] Loading SMTP creds from FloConnection: ${effectiveConnectionId} (source: ${nodeConnectionId ? 'canvas' : 'plug default'})`);
    const connSnap = await getFirestore()
      .collection(COLLECTIONS.HUBS).doc(hubId)
      .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
      .collection(HUB_COLLECTIONS.FLO_CONNECTIONS).doc(effectiveConnectionId)
      .get();

    if (!connSnap.exists) {
      throw new Error(
        `FloConnection "${effectiveConnectionId}" not found. ` +
        `Ensure a Hub Admin has created this SMTP connection in the Connections tab.`
      );
    }

    const connData = connSnap.data() as FloConnectionDoc;
    if (!connData.isActive) {
      throw new Error(`FloConnection "${effectiveConnectionId}" is inactive.`);
    }
    rawCreds = connData.credentials as Record<string, string>;
    console.log(`[emailNode] SMTP credentials loaded from FloConnection "${connData.name}"`);
  } else if (plugConfig.credentials && Object.keys(plugConfig.credentials).length > 0) {
    // Legacy inline credentials
    console.log(`[emailNode] Using inline SMTP credentials from plug (legacy)`);
    rawCreds = plugConfig.credentials;
  } else {
    throw new Error(
      `Email plug "${plugId}" has no SMTP credentials. ` +
      `Configure a FloConnection or ask your Hub Admin to add inline credentials.`
    );
  }

  return {
    host:      rawCreds.host,
    port:      Number(rawCreds.port ?? 587),
    secure:    rawCreds.secure === 'true' || (rawCreds.secure as any) === true,
    user:      rawCreds.user,
    password:  rawCreds.password,
    fromEmail: rawCreds.fromEmail,
    fromName:  rawCreds.fromName ?? '',
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeEmailNode(
  cStream: Record<string, unknown>,
  nd:      Record<string, any>,
  store:   { global: Record<string, unknown>; local: Record<string, unknown> },
): Promise<{ cStream: Record<string, unknown>; logLine: string }> {

  const { hubId, tenantId }  = nd;
  const plugId               = nd.plugId          as string;
  const outputTarget         = (nd.outputTarget   as string) || 'cStream';
  const outputVarName        = (nd.outputVarName  as string) || '';
  // Developer's canvas choice — overrides plug's admin-set default
  const nodeConnectionId     = (nd.connectionId   as string) || '';

  console.log(`[emailNode] START plugId=${plugId} hubId=${hubId} nodeConnectionId=${nodeConnectionId || '(none)'}`);

  // ── Build resolve context ──────────────────────────────────────────────────
  const ctx: ResolveContext = { cStream, store };

  // ── Read emailBindings ─────────────────────────────────────────────────────
  const bindings = (nd.emailBindings ?? {}) as Record<string, {
    source:        string;
    value:         string;
    asAttachment?: boolean;
    fileName?:     string;
    contentType?:  string;
  }>;

  // ── Resolve each field ─────────────────────────────────────────────────────
  const toRaw   = resolveToString(bindings.to      as any, ctx);
  const ccRaw   = resolveToString(bindings.cc      as any, ctx);
  const bccRaw  = resolveToString(bindings.bcc     as any, ctx);
  const subject = resolveToString(bindings.subject as any, ctx);
  let   bodyRaw = resolveToString(bindings.body    as any, ctx);

  if (!bodyRaw && bindings.body?.source === 'cStream') {
    const msg = cStream.message;
    if (msg != null) {
      bodyRaw = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
      console.log('[emailNode] body resolved from cStream.message directly');
    }
  }

  const attachName    = bindings.body?.fileName    || 'attachment.txt';
  const attachContent = bindings.body?.contentType || 'text/plain';
  const isAttach      = bindings.body?.asAttachment === true;
  const isHtml        = attachContent === 'text/html';

  const toList  = parseAddresses(toRaw);
  const ccList  = parseAddresses(ccRaw);
  const bccList = parseAddresses(bccRaw);

  if (toList.length === 0) {
    throw new Error(`[emailNode] 'to' resolved to empty — check binding source/path`);
  }

  console.log(`[emailNode] to=${toList.join(',')} subject="${subject}" body length=${bodyRaw.length}`);

  // ── Load SMTP credentials (canvas choice > plug default > inline) ──────────
  const smtp = await loadSmtpCredentials(hubId, tenantId, plugId, nodeConnectionId);

  // ── Build transporter ──────────────────────────────────────────────────────
  const transporter = nodemailer.createTransport({
    host:   smtp.host,
    port:   smtp.port,
    secure: smtp.secure,
    auth:   { user: smtp.user, pass: smtp.password },
  });

  // ── Build mail options ─────────────────────────────────────────────────────
  const from = smtp.fromName
    ? `"${smtp.fromName}" <${smtp.fromEmail}>`
    : smtp.fromEmail;

  const mailOptions: nodemailer.SendMailOptions = {
    from,
    to:      toList,
    cc:      ccList.length  ? ccList  : undefined,
    bcc:     bccList.length ? bccList : undefined,
    subject,
    ...(isAttach
      ? {
          text:        `Please find the attachment: ${attachName}`,
          attachments: [{ filename: attachName, content: bodyRaw, contentType: attachContent }],
        }
      : isHtml
        ? { html: bodyRaw }
        : { text: bodyRaw }
    ),
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  console.log(`[emailNode] Sending via ${smtp.host}:${smtp.port} secure=${smtp.secure}`);
  const info = await transporter.sendMail(mailOptions);
  console.log(`[emailNode] Sent messageId=${info.messageId}`);

  const emailResult = {
    messageId: info.messageId,
    to:        toList,
    cc:        ccList,
    bcc:       bccList,
    subject,
    mode:      isAttach ? 'attachment' : 'inline',
    status:    'sent',
  };

  const connLabel = nodeConnectionId || 'inline-creds';
  const logLine = `✓ EmailNode: to=${toList.join(',')} subject="${subject}" msgId=${info.messageId} mode=${emailResult.mode} conn=${connLabel}`;

  // ── Route output ───────────────────────────────────────────────────────────
  if (outputTarget === 'local' && outputVarName) {
    store.local[outputVarName] = emailResult;
    const nextCs = { ...cStream, _meta: { ...(cStream._meta as object ?? {}), source: 'emailNode' } };
    return { cStream: nextCs, logLine };
  }

  if (outputTarget === 'global' && outputVarName) {
    store.global[outputVarName] = emailResult;
    const nextCs = { ...cStream, _meta: { ...(cStream._meta as object ?? {}), source: 'emailNode' } };
    return { cStream: nextCs, logLine };
  }

  return {
    cStream: wrapMessage(emailResult, { source: 'emailNode' }) as Record<string, unknown>,
    logLine,
  };
}
