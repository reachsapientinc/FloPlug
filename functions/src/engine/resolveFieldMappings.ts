/**
 * Best-guess semantic field mapping + explicit MappingRule overrides.
 */

import type { ParsedField } from '@floplug/shared';
import {
  isFieldEffectivelyRequired,
  looksLikeExpression,
  safeEvalExpression,
  buildEvalContext,
  type FloRunMeta,
} from '@floplug/shared';
import { getValue } from '../utils/pathUtils.js';

export interface MappingRule {
  targetField:   string;
  sourceType:    'cStream' | 'local' | 'global' | 'literal' | 'expression';
  sourceField?:  string;
  literalValue?: string;
  transform?:    'toString' | 'toNumber' | 'toDate' | 'toBoolean' | 'uppercase' | 'lowercase';
}

export interface ResolveFieldMappingsInput {
  inputSchema:   ParsedField[];
  cStream:       Record<string, unknown>;
  localStore:    Record<string, unknown>;
  globalStore:   Record<string, unknown>;
  mappingRules?: MappingRule[];
  /** When true, only explicit mappingRules are applied (no server-side auto-guess). */
  explicitRulesOnly?: boolean;
  floRunMeta?:    Readonly<FloRunMeta>;
}

export interface ResolveFieldMappingsResult {
  resolved:           Record<string, unknown>;
  unmappedRequired:   string[];
  unmappedFields:     string[];
}

const CONNECTOR_PREFIXES = /^(wd|sf|sap|ora)_/i;
const STOP_TOKENS = new Set(['id', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'by']);

// ── Normalisation ─────────────────────────────────────────────────────────────

function camelToWords(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalise(name: string): string {
  return camelToWords(name)
    .replace(CONNECTOR_PREFIXES, '')
    .toLowerCase()
    .trim();
}

function meaningfulTokens(normalised: string): string[] {
  return normalised.split(/\s+/).filter(t => t.length > 1 && !STOP_TOKENS.has(t));
}

// ── Levenshtein ───────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// ── Scoring ─────────────────────────────────────────────────────────────────────

function parentSegment(path: string): string {
  const parts = path.split('.');
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? '';
}

function scoreMatch(
  targetNorm: string,
  candidateNorm: string,
  targetPath?: string,
  candidatePath?: string,
): number {
  if (targetNorm === candidateNorm) return 100;

  const targetLeaf = (targetPath?.split('.').pop() ?? '').toLowerCase();
  const candLeaf   = (candidatePath?.split('.').pop() ?? '').toLowerCase();

  // Avoid mapping every *_Reference.ID to the first *Item_ID in the sample.
  if (targetLeaf === 'id' || candLeaf === 'id') {
    if (targetPath && candidatePath && normalise(targetPath) === normalise(candidatePath)) {
      return 100;
    }
    const tp = normalise(parentSegment(targetPath ?? ''));
    const cp = normalise(parentSegment(candidatePath ?? ''));
    if (tp && cp && (tp === cp || levenshtein(tp, cp) <= 1)) return 90;
    return 0;
  }

  const shorter = Math.min(targetNorm.length, candidateNorm.length);
  if (shorter >= 4 && (targetNorm.includes(candidateNorm) || candidateNorm.includes(targetNorm))) {
    return 80;
  }
  if (levenshtein(targetNorm, candidateNorm) <= 2) return 60;

  const targetTokens    = meaningfulTokens(targetNorm);
  const candidateTokens = meaningfulTokens(candidateNorm);
  const shared = targetTokens.filter(t => candidateTokens.includes(t));
  if (shared.length >= 2) return 40;

  return 0;
}

// ── Flatten object to dot-paths ─────────────────────────────────────────────────

function flattenPaths(
  obj: unknown,
  prefix = '',
  out: string[] = [],
): string[] {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out.push(prefix);
    return out;
  }
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length === 0 && prefix) {
    out.push(prefix);
    return out;
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const val  = rec[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flattenPaths(val, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function applyTransform(
  value: unknown,
  transform?: MappingRule['transform'],
): unknown {
  if (value === undefined || value === null || !transform) return value;
  switch (transform) {
    case 'toString':  return String(value);
    case 'toNumber':  return Number(value);
    case 'toDate':    return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
    case 'toBoolean': return Boolean(value);
    case 'uppercase': return String(value).toUpperCase();
    case 'lowercase': return String(value).toLowerCase();
    default:          return value;
  }
}

function resolveRuleValue(
  rule: MappingRule,
  cStream: Record<string, unknown>,
  localStore: Record<string, unknown>,
  globalStore: Record<string, unknown>,
  floRunMeta?: Readonly<FloRunMeta>,
): unknown {
  const src = rule.sourceField?.trim() ?? '';
  const exprCtx = buildEvalContext(cStream, { local: localStore, global: globalStore }, floRunMeta);

  let raw: unknown;
  switch (rule.sourceType) {
    case 'literal':
      raw = rule.literalValue ?? '';
      break;
    case 'expression':
      raw = src ? safeEvalExpression(src, exprCtx) : undefined;
      break;
    case 'cStream':
      raw = src
        ? (looksLikeExpression(src)
          ? safeEvalExpression(src, exprCtx)
          : getValue(cStream, src))
        : cStream;
      break;
    case 'local':
      raw = src
        ? (looksLikeExpression(src)
          ? safeEvalExpression(src, exprCtx)
          : getValue(localStore, src))
        : localStore;
      break;
    case 'global':
      raw = src
        ? (looksLikeExpression(src)
          ? safeEvalExpression(src, exprCtx)
          : getValue(globalStore, src))
        : globalStore;
      break;
    default:
      raw = undefined;
  }
  return applyTransform(raw, rule.transform);
}

interface Candidate {
  path:   string;
  value:  unknown;
  source: 'cStream' | 'local' | 'global';
  score:  number;
}

function bestGuessForField(
  field: ParsedField,
  cStream: Record<string, unknown>,
  localStore: Record<string, unknown>,
  globalStore: Record<string, unknown>,
): unknown {
  const targetNorm = normalise(field.path.split('.').pop() ?? field.path);
  const sources: Array<{ store: Record<string, unknown>; type: 'cStream' | 'local' | 'global' }> = [
    { store: cStream, type: 'cStream' },
    { store: localStore, type: 'local' },
    { store: globalStore, type: 'global' },
  ];

  const sourcePriority = { cStream: 3, local: 2, global: 1 };
  let best: Candidate | null = null;

  for (const { store, type } of sources) {
    for (const path of flattenPaths(store)) {
      const leaf     = path.split('.').pop() ?? path;
      const candNorm = normalise(leaf);
      const score    = scoreMatch(targetNorm, candNorm, field.path, path);
      if (score < 60) continue;

      const candidate: Candidate = {
        path,
        value: getValue(store, path),
        source: type,
        score,
      };

      if (
        !best ||
        candidate.score > best.score ||
        (candidate.score === best.score && sourcePriority[candidate.source] > sourcePriority[best.source])
      ) {
        best = candidate;
      }
    }
  }

  return best?.value;
}

// ── Main export ─────────────────────────────────────────────────────────────────

export function resolveFieldMappings(input: ResolveFieldMappingsInput): ResolveFieldMappingsResult {
  const {
    inputSchema,
    cStream,
    localStore,
    globalStore,
    mappingRules = [],
    explicitRulesOnly = false,
    floRunMeta,
  } = input;

  const resolved: Record<string, unknown> = {};
  const ruleTargets = new Set(mappingRules.map(r => r.targetField));

  // 1. Explicit rules always win
  for (const rule of mappingRules) {
    if (!rule.targetField) continue;
    const value = resolveRuleValue(rule, cStream, localStore, globalStore, floRunMeta);
    if (value !== undefined) resolved[rule.targetField] = value;
  }

  // 2. Best-guess for remaining fields (skipped when user supplied explicit rules)
  if (!explicitRulesOnly) {
    for (const field of inputSchema) {
      if (ruleTargets.has(field.path) || field.path in resolved) continue;
      const value = bestGuessForField(field, cStream, localStore, globalStore);
      if (value !== undefined) resolved[field.path] = value;
    }
  }

  const unmappedRequired: string[] = [];
  const unmappedFields: string[] = [];

  for (const field of inputSchema) {
    const hasValue = field.path in resolved && resolved[field.path] !== undefined && resolved[field.path] !== null;
    if (!hasValue) {
      unmappedFields.push(field.path);
      if (isFieldEffectivelyRequired(field, inputSchema, resolved, mappingRules)) {
        unmappedRequired.push(field.path);
      }
    }
  }

  return { resolved, unmappedRequired, unmappedFields };
}
