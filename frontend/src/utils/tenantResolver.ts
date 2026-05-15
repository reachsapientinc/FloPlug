/**
 * tenantResolver.ts
 *
 * FloPlug Routing Strategy (from TenantStrategy.xlsx)
 * ====================================================
 *
 * FOUR FIREBASE PROJECTS — selected at BUILD TIME via VITE_ env vars:
 *   dev.floplug.xyz   →  floplug-dev   (internal devs, simulated slugs)
 *   stage.floplug.xyz →  floplug-stage (pre-release, customer testing)
 *   sb.floplug.xyz    →  floplug-sb    (sandbox, prod-copy for debugging)
 *   prod.floplug.xyz  →  floplug-prod  (live customers)
 *
 * URL RULES (identical logic in all four builds):
 *   {env}.floplug.xyz          →  'admin'     Product admin portal (global users, FloPlug brand)
 *   {env}.floplug.xyz/{slug}   →  'tenant'    Customer workspace (hub-scoped users, custom brand)
 *   floplug.xyz                →  'marketing' Company website (no auth)
 *   localhost                  →  'admin'     Dev convenience fallback
 *
 * MIGRATION PATH:
 *   Product:  DEV → Stage → Prod
 *   Customer: SB ↔ Prod  |  Stage → Prod  |  Stage → SB → Prod
 */

//import { db } from '../firebaseConfig';
import { collectionGroup, query, where, getDocs } from 'firebase/firestore';
import type {PortalMode,FloPlugEnv, TenantConfig, TenantBranding, ResolveResult} from '../../../types/types.ts';
import { db } from '../firebaseConfig.ts';

// ── Public types ──────────────────────────────────────────────────────────────

// export type PortalMode  = 'admin' | 'tenant' | 'marketing';
// export type FloPlugEnv  = 'dev' | 'stage' | 'sb' | 'prod';

// export interface TenantBranding {
//   logoBase64?:   string;
//   accentColor?:  string;
//   displayTitle?: string;
// }

// export interface TenantConfig {
//   tenantId:   string;
//   hubId:      string;
//   tenantName: string;
//   tenantType: FloPlugEnv;
//   isActive:   boolean;
//   slug:       string;
//   env:        FloPlugEnv;
//   branding?:  TenantBranding;
// }

// export interface ResolveResult {
//   mode:    PortalMode;
//   env?:    FloPlugEnv;
//   config?: TenantConfig;
// }

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_ENVS   = new Set<FloPlugEnv>(['dev', 'stage', 'sb', 'prod']);
const BASE_DOMAIN  = '.floplug.xyz';
const LOCAL_HOSTS  = new Set(['localhost', '127.0.0.1']);

// ── URL parsers ───────────────────────────────────────────────────────────────

function parseEnvFromHostname(hostname: string): FloPlugEnv | null {
  if (!hostname.endsWith(BASE_DOMAIN)) return null;
  const sub = hostname.slice(0, hostname.length - BASE_DOMAIN.length);
  return VALID_ENVS.has(sub as FloPlugEnv) ? (sub as FloPlugEnv) : null;
}

function parseSlugFromPath(): string | null {
  const parts = window.location.pathname.replace(/^\//, '').split('/').filter(Boolean);
  return parts.length >= 1 ? parts[0].toLowerCase() : null;
}

// ── Synchronous mode detection ────────────────────────────────────────────────

/** No network calls. Tells App.tsx what to mount immediately. */
export function detectPortalMode(): { mode: PortalMode; env?: FloPlugEnv; slug?: string } {
  const { hostname } = window.location;

  if (LOCAL_HOSTS.has(hostname))                               return { mode: 'admin', env: 'dev' };
  if (hostname === 'floplug.xyz' || hostname === 'www.floplug.xyz') return { mode: 'marketing' };

  const env = parseEnvFromHostname(hostname);
  if (!env) {
    console.warn(`[FloPlug] Unknown host "${hostname}" — falling back to admin`);
    return { mode: 'admin' };
  }

  const slug = parseSlugFromPath();
  return slug
    ? { mode: 'tenant', env, slug }
    : { mode: 'admin',  env };
}

// ── CSS branding ──────────────────────────────────────────────────────────────

function hexToRgba(hex: string, a: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return isNaN(r) ? `rgba(79,142,247,${a})` : `rgba(${r},${g},${b},${a})`;
}

export function applyBranding(b?: TenantBranding): void {
  if (!b) return;
  if (b.accentColor) {
    document.documentElement.style.setProperty('--accent-primary', b.accentColor);
    document.documentElement.style.setProperty('--accent-muted',   hexToRgba(b.accentColor, 0.12));
    document.documentElement.style.setProperty('--accent-border',  hexToRgba(b.accentColor, 0.30));
  }
  if (b.displayTitle) document.title = `${b.displayTitle} — FloPlug`;
}

// ── Firestore lookup ──────────────────────────────────────────────────────────
// Required Collection Group index: Tenants [ slug ASC, tenantType ASC ]

async function fetchTenantDoc(slug: string, env: FloPlugEnv): Promise<TenantConfig | null> {
  try {
    //const { db } = await import('../firebaseConfig');
    
    const snap = await getDocs(query(
      collectionGroup(db, 'Tenants'),
      where('slug',       '==', slug),
      where('tenantType', '==', env),
    ));
    if (snap.empty) { console.warn(`[FloPlug] No tenant: slug="${slug}" env="${env}"`); return null; }

    const d    = snap.docs[0];
    const data = d.data();
    const hubId = d.ref.parent.parent?.id ?? (data.hubId as string) ?? '';

    return {
      tenantId:   d.id,
      hubId,
      tenantName: (data.tenantName as string)    ?? slug,
      tenantType: (data.tenantType as FloPlugEnv) ?? env,
      isActive:   (data.isActive   as boolean)   ?? false,
      slug, env,
      branding: {
        logoBase64:   data.branding?.logoBase64   as string | undefined,
        accentColor:  data.branding?.accentColor  as string | undefined,
        displayTitle: (data.branding?.displayTitle ?? data.tenantName) as string | undefined,
      },
    };
  } catch (err) {
    console.error('[FloPlug] Tenant resolution error:', err);
    return null;
  }
}

/** Async entry point — only called when mode === 'tenant'. */
export async function resolveTenant(slug: string, env: FloPlugEnv): Promise<ResolveResult> {
  const config = await fetchTenantDoc(slug, env);
  if (config) applyBranding(config.branding);
  return { mode: 'tenant', env, config: config ?? undefined };
}
