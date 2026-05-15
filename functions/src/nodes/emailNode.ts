/**
 * emailNode.ts
 *
 * Executes an emailNode in the Flo.
 * Plug admins configure SMTP credentials — developers never see them.
 * Developers configure: to, cc, bcc, subject, body, contentType, bodyMode.
 * All fields support static | cStream | local | global value bindings.
 */

import nodemailer                  from 'nodemailer';
import { getFirestore }            from 'firebase-admin/firestore';
import {COLLECTIONS,HUB_COLLECTIONS} from '@floplug/shared';

// ── Value binding resolver ────────────────────────────────────────────────────

function resolveBinding(
  binding:  { source: string; value: string } | undefined,
  cStream:  Record<string, unknown>,
  local:    Record<string, unknown>,
  global:   Record<string, unknown>,
): string {
  if (!binding?.value) return '';
  const val = (() => {
    switch (binding.source) {
      case 'static':  return binding.value;
      case 'cStream': return getPath(cStream, binding.value);
      case 'local':   return getPath(local,   binding.value);
      case 'global':  return getPath(global,  binding.value);
      default:        return binding.value;
    }
  })();
  return val == null ? '' : String(val);
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) =>
    cur != null && typeof cur === 'object' ? (cur as Record<string, unknown>)[key] : undefined,
    obj
  );
}

// ── Address parser ────────────────────────────────────────────────────────────
// Accepts "a@b.com, c@d.com" or ["a@b.com","c@d.com"]

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

async function loadSmtpPlug(
  hubId:    string,
  tenantId: string,
  plugId:   string,
): Promise<SmtpPlug> {
  const snap = await getFirestore()
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS).doc(plugId)
    .get();

  if (!snap.exists) throw new Error(`EmailPlug not found: ${plugId}`);

  const d = snap.data() as any;
  // Guard: accept smtp_basic authProtocol OR legacy connectorType==='email'
  if (d.authProtocol !== 'smtp_basic' && d.nodeType !== 'emailNode') {
    throw new Error(`Plug ${plugId} is not an email plug (authProtocol=${d.authProtocol})`);
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
  cStream:  Record<string, unknown>,
  nd:       Record<string, any>,
  store:    { global: Record<string, unknown>; local: Record<string, unknown> },
): Promise<{ cStream: Record<string, unknown>; logLine: string }> {

  const { hubId, tenantId } = nd;
  const plugId = nd.plugId as string;

  console.log(`[emailNode] START plugId=${plugId} hubId=${hubId}`);

  // ── Read emailBindings (set by developer in the canvas inspector) ───────────
  // Structure: nd.emailBindings.{ to, cc, bcc, subject, body }
  //   each: { source: 'static'|'cStream'|'local'|'global', value: string,
  //            asAttachment?: boolean, fileName?: string, contentType?: string }
  const bindings = (nd.emailBindings ?? {}) as Record<string, {
    source:        string;
    value:         string;
    asAttachment?: boolean;
    fileName?:     string;
    contentType?:  string;
  }>;

  // ── Resolve bindings ────────────────────────────────────────────────────────
  const toRaw      = resolveBinding(bindings.to,      cStream, store.local, store.global);
  const ccRaw      = resolveBinding(bindings.cc,      cStream, store.local, store.global);
  const bccRaw     = resolveBinding(bindings.bcc,     cStream, store.local, store.global);
  const subject    = resolveBinding(bindings.subject,  cStream, store.local, store.global);
  const bodyRaw    = resolveBinding(bindings.body,     cStream, store.local, store.global);

  // attachmentName and contentType come from the body binding's attachment sub-fields
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

  console.log(`[emailNode] to=${toList.join(',')} subject="${subject}"`);

  // ── Load SMTP plug ──────────────────────────────────────────────────────────
  const plug = await loadSmtpPlug(hubId, tenantId, plugId);

  // ── Build transporter ───────────────────────────────────────────────────────
  const transporter = nodemailer.createTransport({
    host:   plug.host,
    port:   plug.port,
    secure: plug.secure,
    auth:   { user: plug.user, pass: plug.password },
  });

  // ── Build mail options ──────────────────────────────────────────────────────
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

  // ── Send ────────────────────────────────────────────────────────────────────
  console.log(`[emailNode] Sending via ${plug.host}:${plug.port} secure=${plug.secure}`);
  const info = await transporter.sendMail(mailOptions);
  console.log(`[emailNode] Sent messageId=${info.messageId}`);

  // ── Write result to cStream ─────────────────────────────────────────────────
  const nextCStream: Record<string, unknown> = {
    ...cStream,
    _emailResult: {
      messageId: info.messageId,
      to:        toList,
      cc:        ccList,
      bcc:       bccList,
      subject,
      mode:      isAttach ? 'attachment' : 'inline',
      status:    'sent',
    },
  };

  const logLine = `✓ EmailNode: to=${toList.join(',')} subject="${subject}" msgId=${info.messageId} mode=${isAttach ? 'attachment' : 'inline'}`;
  return { cStream: nextCStream, logLine };
}