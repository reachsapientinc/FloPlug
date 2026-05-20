/**
 * Client-side helpers for FloAction field mapper (sample parse + auto-map scoring).
 */

import type { ParsedField } from '@floplug/shared';

export interface MappingRuleClient {
  targetField:  string;
  sourceType:   'cStream' | 'local' | 'global' | 'literal';
  sourceField?: string;
  literalValue?: string;
}

export interface SourceFieldNode {
  path:     string;
  label:    string;
  children?: SourceFieldNode[];
}

const CONNECTOR_PREFIXES = /^(wd|sf|sap|ora)_/i;
const STOP_TOKENS = new Set(['id', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'by']);

function camelToWords(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalise(name: string): string {
  return camelToWords(name).replace(CONNECTOR_PREFIXES, '').toLowerCase().trim();
}

function meaningfulTokens(n: string): string[] {
  return n.split(/\s+/).filter(t => t.length > 1 && !STOP_TOKENS.has(t));
}

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

function scoreMatch(targetNorm: string, candidateNorm: string): number {
  if (targetNorm === candidateNorm) return 100;
  if (targetNorm.includes(candidateNorm) || candidateNorm.includes(targetNorm)) return 80;
  if (levenshtein(targetNorm, candidateNorm) <= 2) return 60;
  const shared = meaningfulTokens(targetNorm).filter(t => meaningfulTokens(candidateNorm).includes(t));
  if (shared.length >= 2) return 40;
  return 0;
}

export function flattenObjectPaths(
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
  for (const key of Object.keys(rec)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const val  = rec[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      flattenObjectPaths(val, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

export function buildSourceTree(obj: Record<string, unknown>): SourceFieldNode[] {
  const paths = flattenObjectPaths(obj);
  const root: SourceFieldNode[] = [];
  const index = new Map<string, SourceFieldNode>();

  for (const path of paths) {
    const parts = path.split('.');
    let parentList = root;
    let prefix = '';

    for (let i = 0; i < parts.length; i++) {
      const part   = parts[i];
      prefix       = prefix ? `${prefix}.${part}` : part;
      const isLeaf = i === parts.length - 1;

      if (isLeaf) {
        parentList.push({ path, label: camelToWords(part) });
        break;
      }

      let branch = index.get(prefix);
      if (!branch) {
        branch = { path: prefix, label: camelToWords(part), children: [] };
        parentList.push(branch);
        index.set(prefix, branch);
      }
      if (!branch.children) branch.children = [];
      parentList = branch.children;
    }
  }
  return root;
}

export function parseSampleInput(
  raw: string,
  format: 'json' | 'xml',
): Record<string, unknown> {
  if (format === 'json') {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  }

  const parser = new DOMParser();
  const doc    = parser.parseFromString(raw, 'text/xml');
  const err    = doc.querySelector('parsererror');
  if (err) throw new Error('Invalid XML sample');

  const root = doc.documentElement;
  if (!root) throw new Error('Empty XML document');
  return { [root.localName || root.tagName]: xmlElementToValue(root) };
}

function xmlElementToValue(el: Element): unknown {
  const children = Array.from(el.children).filter(c => c.nodeType === 1);
  if (children.length === 0) {
    const text = (el.textContent ?? '').trim();
    return text;
  }
  const obj: Record<string, unknown> = {};
  for (const child of children) {
    const name = child.localName || child.tagName;
    const val  = xmlElementToValue(child);
    if (obj[name] !== undefined) {
      const prev = obj[name];
      obj[name] = Array.isArray(prev) ? [...prev, val] : [prev, val];
    } else {
      obj[name] = val;
    }
  }
  return obj;
}

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj as unknown);
}

/** Suggest mapping rules from sample source object to target schema fields. */
export function suggestMappingRules(
  targetFields: ParsedField[],
  sourceObj:    Record<string, unknown>,
  existing:     MappingRuleClient[] = [],
): MappingRuleClient[] {
  const rules: MappingRuleClient[] = [...existing];
  const usedTargets = new Set(existing.map(r => r.targetField));
  const usedSources = new Set(existing.map(r => r.sourceField).filter(Boolean));
  const sourcePaths = flattenObjectPaths(sourceObj);

  for (const field of targetFields) {
    if (usedTargets.has(field.path)) continue;

    const targetNorm = normalise(field.path.split('.').pop() ?? field.path);
    let bestPath: string | null = null;
    let bestScore = 0;

    for (const sp of sourcePaths) {
      if (usedSources.has(sp)) continue;
      const leaf = sp.split('.').pop() ?? sp;
      const score = scoreMatch(targetNorm, normalise(leaf));
      if (score >= 60 && score > bestScore) {
        bestScore = score;
        bestPath  = sp;
      }
    }

    if (bestPath) {
      rules.push({
        targetField: field.path,
        sourceType:  'cStream',
        sourceField: bestPath,
      });
      usedTargets.add(field.path);
      usedSources.add(bestPath);
    }
  }

  return rules;
}

export function getMappedTargetPaths(rules: MappingRuleClient[]): Set<string> {
  return new Set(rules.map(r => r.targetField));
}

export function getSourcePathForTarget(
  rules: MappingRuleClient[],
  targetPath: string,
): string | undefined {
  return rules.find(r => r.targetField === targetPath)?.sourceField;
}

export function countMappedRequired(
  targetFields: ParsedField[],
  rules:        MappingRuleClient[],
): { mapped: number; required: number } {
  const required = targetFields.filter(f => f.required);
  const mapped   = required.filter(f => rules.some(r => r.targetField === f.path));
  return { mapped: mapped.length, required: required.length };
}
