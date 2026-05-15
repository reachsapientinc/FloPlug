/**
 * emailNode.ts
 *
 * Executes an email plug node in a Flo.
 * Plug admins configure SMTP credentials — developers never see them.
 * Developers configure: to, cc, bcc, subject, body via emailBindings on the node.
 *
 * All fields resolve through the canonical resolveValue helpers:
 *   source=cStream  → cStream.message (or cStream.message.path)
 *   source=local    → store.local.varName
 *   source=global   → store.global.varName
 *   source=static   → literal string
 *
 * Output target:
 *   nd.outputTarget = 'cStream' (default) → replaces cStream with email result
 *   nd.outputTarget = 'local'             → store.local[outputVarName] = result
 *   nd.outputTarget = 'global'            → store.global[outputVarName] = result
 */

import nodemailer                                            from 'nodemailer';
import { getFirestore }                                     from 'firebase-admin/firestore';
import { COLLECTIONS, HUB_COLLECTIONS }                    from '@floplug/shared';
import { resolveToString, wrapMessage, type ResolveContext } from './cStreamMeta.js';

// ── Address parser ────────────────────────────────────────────────────────────
function parseAddresses(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ── SMTP credentials loader ───────────────────────────────────────────────────
interface SmtpPlug {
  host:      string;
  port:      number;
  secure:    boolean;
  user:      string;
  password:  string;
  fromEmail: string;
  fromName?: string;
}

async function loadSmtpPlug(hubId: string, tenantId: string, plugId: string): Promise<SmtpPlug> {
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

  return {
    host:      d.credentials.host,
    port:      Number(d.credentials.port ?? 587),
    secure:    d.credentials.secure === 'true' || d.credentials.secure === true,
    user:      d.credentials.user,
    password:  d.credentials.password,
    fromEmail: d.credentials.fromEmail,
    fromName:  d.credentials.fromName ?? '',
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────
export async function executeEmailNode(
  cStream: Record<string, unknown>,
  nd:      Record<string, any>,
  store:   { global: Record<string, unknown>; local: Record<string, unknown> },
): Promise<{ cStream: Record<string, unknown>; logLine: string }> {

  const { hubId, tenantId } = nd;
  const plugId        = nd.plugId        as string;
  const outputTarget  = (nd.outputTarget  as string) || 'cStream';
  const outputVarName = (nd.outputVarName as string) || '';

  console.log(`[emailNode] START plugId=${plugId} hubId=${hubId} outputTarget=${outputTarget}`);

  // ── Build resolve context using canonical helpers ────────────────────────────
  const ctx: ResolveContext = { cStream, store };

  // ── Read emailBindings ───────────────────────────────────────────────────────
  // Shape: { to, cc, bcc, subject, body } each:
  //   { source: 'static'|'cStream'|'local'|'global', value: string,
  //     asAttachment?: boolean, fileName?: string, contentType?: string }
  const bindings = (nd.emailBindings ?? {}) as Record<string, {
    source:        string;
    value:         string;
    asAttachment?: boolean;
    fileName?:     string;
    contentType?:  string;
  }>;

  // ── Resolve each field ───────────────────────────────────────────────────────
  const toRaw   = resolveToString(bindings.to      as any, ctx);
  const ccRaw   = resolveToString(bindings.cc      as any, ctx);
  const bccRaw  = resolveToString(bindings.bcc     as any, ctx);
  const subject = resolveToString(bindings.subject  as any, ctx);
  let   bodyRaw = resolveToString(bindings.body     as any, ctx);

  // Body fallback: if cStream source and body came back empty,
  // use cStream.message directly (most common case — send upstream payload)
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

  // ── Load SMTP credentials ────────────────────────────────────────────────────
  const plug = await loadSmtpPlug(hubId, tenantId, plugId);

  // ── Build transporter ────────────────────────────────────────────────────────
  const transporter = nodemailer.createTransport({
    host:   plug.host,
    port:   plug.port,
    secure: plug.secure,
    auth:   { user: plug.user, pass: plug.password },
  });

  // ── Build mail options ───────────────────────────────────────────────────────
  const from = plug.fromName ? `"${plug.fromName}" <${plug.fromEmail}>` : plug.fromEmail;

  const mailOptions: nodemailer.SendMailOptions = {
    from,
    to:      toList,
    cc:      ccList.length  ? ccList  : undefined,
    bcc:     bccList.length ? bccList : undefined,
    subject,
    ...(isAttach
      ? {
          text:        `Please find the attachment: ${attachName}`,
          attachments: [{
            filename:    attachName,
            content:     bodyRaw,
            contentType: attachContent,
          }],
        }
      : isHtml
        ? { html: bodyRaw }
        : { text: bodyRaw }
    ),
  };

  // ── Send ─────────────────────────────────────────────────────────────────────
  console.log(`[emailNode] Sending via ${plug.host}:${plug.port} secure=${plug.secure}`);
  const info = await transporter.sendMail(mailOptions);
  console.log(`[emailNode] Sent messageId=${info.messageId}`);

  // ── Build result payload ─────────────────────────────────────────────────────
  const emailResult = {
    messageId: info.messageId,
    to:        toList,
    cc:        ccList,
    bcc:       bccList,
    subject,
    mode:      isAttach ? 'attachment' : 'inline',
    status:    'sent',
  };

  const logLine = `✓ EmailNode: to=${toList.join(',')} subject="${subject}" msgId=${info.messageId} mode=${emailResult.mode}`;

  // ── Route output ─────────────────────────────────────────────────────────────
  if (outputTarget === 'local' && outputVarName) {
    store.local[outputVarName] = emailResult;
    // cStream passes through — just tag _meta.source
    const nextCs = { ...cStream, _meta: { ...(cStream._meta as object ?? {}), source: 'emailNode' } };
    return { cStream: nextCs, logLine };
  }

  if (outputTarget === 'global' && outputVarName) {
    store.global[outputVarName] = emailResult;
    const nextCs = { ...cStream, _meta: { ...(cStream._meta as object ?? {}), source: 'emailNode' } };
    return { cStream: nextCs, logLine };
  }

  // Default: wrap result as canonical cStream
  return {
    cStream: wrapMessage(emailResult, { source: 'emailNode' }) as Record<string, unknown>,
    logLine,
  };
}
