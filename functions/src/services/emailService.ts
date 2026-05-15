/**
 * emailService.ts
 *
 * Centralised email service for FloPlug.
 *
 * Flow:
 *   1. Resolve the ActivePieces webhook URL from Firestore (FloPlugGlobalSettings/ExternalIntegrations)
 *   2. Resolve the hub's email settings (override address, notifications enabled)
 *   3. If override is active, redirect toAddress and prepend a banner to the body
 *   4. If emailNotificationsEnabled is false, skip sending but still log as 'suppressed'
 *   5. POST to ActivePieces webhook
 *   6. Write to FloPlugHubs/{hubId}/EmailLog regardless of outcome
 *
 * EmailLog document shape:
 *   toAddress:    string      — where the email actually went
 *   intendedTo:   string      — original recipient (same as toAddress when no override)
 *   cc:           string      — comma-separated CC list
 *   bcc:          string      — comma-separated BCC list
 *   fromEmail:    string
 *   subject:      string
 *   emailBody:    string
 *   purpose:      EmailPurpose
 *   status:       'sent' | 'suppressed' | 'failed'
 *   overrideActive: boolean
 *   error:        string | null
 *   sentAt:       Timestamp
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import axios from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const NOREPLY_EMAIL   = 'noreply@floplug.xyz';
const EMAIL_SOURCE    = 'floplug-functions';

// ── Types ─────────────────────────────────────────────────────────────────────
export type EmailPurpose =
  | 'HUB_ADMIN_INVITE'
  | 'HUB_USER_INVITE'
  | 'ADMIN_USER_INVITE'
  | 'PASSWORD_RESET'
  | 'TENANT_ACTIVATED'
  | 'SYSTEM_NOTIFICATION';

export interface SendEmailOptions {
  hubId:       string;           // Used to resolve hub settings + write EmailLog
  toAddress:   string;           // Intended recipient
  subject:     string;
  emailBody:   string;
  purpose:     EmailPurpose;
  fromEmail?:  string;           // Defaults to NOREPLY_EMAIL
  cc?:         string[];
  bcc?:        string[];
}

interface HubEmailSettings {
  emailNotificationsEnabled:    boolean;
  overrideNotificationsEmailId: string | null;
}

interface EmailLogEntry {
  toAddress:      string;
  intendedTo:     string;
  cc:             string;
  bcc:            string;
  fromEmail:      string;
  subject:        string;
  emailBody:      string;
  purpose:        EmailPurpose;
  status:         'sent' | 'suppressed' | 'failed';
  overrideActive: boolean;
  error:          string | null;
  sentAt:         FirebaseFirestore.FieldValue;
}

// ── Firestore ref ─────────────────────────────────────────────────────────────
const db         = getFirestore();
const EXT_INT_PATH = db.collection('FloPlugGlobalSettings').doc('ExternalIntegrations');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolves the ActivePieces webhook URL for a given API name.
 * Reads: FloPlugGlobalSettings/ExternalIntegrations
 *   → Activepieces.url + Activepieces.{apiName}APIKey
 */
async function getIntegrationWebhookUrl(
  integrationName: string,
  apiName: string
): Promise<string | null> {
  try {
    const snap = await EXT_INT_PATH.get();
    if (!snap.exists) return null;

    const data           = snap.data();
    const integrationMap = data?.[integrationName] as Record<string, string> | undefined;
    if (!integrationMap) return null;

    const baseUrl = integrationMap.url;
    if (!apiName) return baseUrl ?? null;

    const apiKey = integrationMap[`${apiName}APIKey`];
    if (baseUrl && apiKey) {
      const formattedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      return `${formattedBase}${apiKey}`;
    }

    return baseUrl ?? null;
  } catch (err) {
    console.error(`[getIntegrationWebhookUrl] Error for ${integrationName}/${apiName}:`, err);
    return null;
  }
}

/**
 * Reads email notification settings from the hub document.
 * Falls back to safe defaults (notifications off, no override) if the hub
 * doc is missing or the fields are not yet set.
 */
async function getHubEmailSettings(hubId: string): Promise<HubEmailSettings> {
  try {
    const snap = await db.collection('FloPlugHubs').doc(hubId).get();
    if (!snap.exists) {
      return { emailNotificationsEnabled: false, overrideNotificationsEmailId: null };
    }
    const data = snap.data()!;
    return {
      emailNotificationsEnabled:    data.emailNotificationsEnabled    ?? false,
      overrideNotificationsEmailId: data.overrideNotificationsEmailId ?? null,
    };
  } catch {
    return { emailNotificationsEnabled: false, overrideNotificationsEmailId: null };
  }
}

/**
 * Writes a record to FloPlugHubs/{hubId}/EmailLog.
 * Never throws — a logging failure must not break the calling flow.
 */
async function writeEmailLog(hubId: string, entry: EmailLogEntry): Promise<void> {
  try {
    await db.collection(`FloPlugHubs/${hubId}/EmailLog`).add(entry);
  } catch (err) {
    console.error(`[emailService] Failed to write EmailLog for hub ${hubId}:`, err);
  }
}

/**
 * Builds the override banner prepended to the email body when redirect is active.
 * Included in both the log and the actual email so the tester always knows
 * who the email was originally meant for.
 */
function buildOverrideBanner(intendedTo: string): string {
  return [
    '⚠️ ─────────────────────────────────────────────',
    '   OVERRIDE MODE — This email was redirected.',
    `   Originally intended for: ${intendedTo}`,
    '─────────────────────────────────────────────────',
    '',
  ].join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * sendEmail — the single entry point for all outbound email in FloPlug.
 *
 * Usage:
 *   await sendEmail({
 *     hubId:     'acme',
 *     toAddress: 'admin@acme.floplug.xyz',
 *     subject:   'Welcome to FloPlug',
 *     emailBody: '<p>Your invite link: ...</p>',
 *     purpose:   'HUB_ADMIN_INVITE',
 *   });
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const {
    hubId,
    toAddress,
    subject,
    emailBody,
    purpose,
    fromEmail = NOREPLY_EMAIL,
    cc        = [],
    bcc       = [],
  } = options;

  // 1. Resolve hub email settings
  const { emailNotificationsEnabled, overrideNotificationsEmailId } =
    await getHubEmailSettings(hubId);

  // 2. Determine actual recipient and whether override is active
  const overrideActive = !!overrideNotificationsEmailId;
  const actualTo       = overrideActive ? overrideNotificationsEmailId! : toAddress;
  const intendedTo     = toAddress; // always the original intended address

  // 3. Build final email body — prepend override banner when redirecting
  const finalBody = overrideActive
    ? `${buildOverrideBanner(intendedTo)}${emailBody}`
    : emailBody;

  // 4. If notifications are disabled, log as suppressed and bail out
  if (!emailNotificationsEnabled) {
    console.info(
      `[emailService] Notifications disabled for hub "${hubId}". ` +
      `Suppressing email to ${intendedTo} (purpose: ${purpose})`
    );
    await writeEmailLog(hubId, {
      toAddress:      actualTo,
      intendedTo,
      cc:             cc.join(', '),
      bcc:            bcc.join(', '),
      fromEmail,
      subject,
      emailBody:      finalBody,
      purpose,
      status:         'suppressed',
      overrideActive,
      error:          null,
      sentAt:         FieldValue.serverTimestamp(),
    });
    return;
  }

  // 5. Resolve ActivePieces webhook URL
  const webhookUrl = await getIntegrationWebhookUrl('Activepieces', 'sendEmail');
  if (!webhookUrl) {
    console.error('[emailService] ActivePieces webhook URL not configured. Cannot send email.');
    await writeEmailLog(hubId, {
      toAddress:      actualTo,
      intendedTo,
      cc:             cc.join(', '),
      bcc:            bcc.join(', '),
      fromEmail,
      subject,
      emailBody:      finalBody,
      purpose,
      status:         'failed',
      overrideActive,
      error:          'ActivePieces webhook URL not found in FloPlugGlobalSettings/ExternalIntegrations',
      sentAt:         FieldValue.serverTimestamp(),
    });
    return;
  }

  // 6. Send via ActivePieces
  let status: 'sent' | 'failed' = 'sent';
  let error: string | null       = null;

  try {
    await axios.post(
      webhookUrl,
      {
        source:    EMAIL_SOURCE,
        fromEmail,
        to:        actualTo,          // where it actually goes
        intendedTo,                   // carried in payload for ActivePieces logging
        cc:        cc.join(', '),
        bcc:       bcc.join(', '),
        subject,
        content:   finalBody,
      },
      {
        headers: {
          'x-auth-token': EMAIL_SOURCE,
          'x-app-source': EMAIL_SOURCE,
        },
      }
    );
    console.info(
      `[emailService] Email sent — purpose: ${purpose}, ` +
      `to: ${actualTo}${overrideActive ? ` (intended: ${intendedTo})` : ''}`
    );
  } catch (err: any) {
    status = 'failed';
    error  = err?.message ?? 'Unknown error';
    console.error(`[emailService] Failed to send email (purpose: ${purpose}):`, err);
  }

  // 7. Write to EmailLog regardless of send outcome
  await writeEmailLog(hubId, {
    toAddress:      actualTo,
    intendedTo,
    cc:             cc.join(', '),
    bcc:            bcc.join(', '),
    fromEmail,
    subject,
    emailBody:      finalBody,
    purpose,
    status,
    overrideActive,
    error,
    sentAt:         FieldValue.serverTimestamp(),
  });
}