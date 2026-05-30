/**
 * Shared binding / placeholder validation helpers.
 */

import type { FloValidationIssue } from '../types/floValidation.js';
import { validateFloExpression, structuralExpressionCheck } from '../utils/floExpression.js';

export type BindingSource = 'static' | 'cStream' | 'local' | 'global' | 'literal' | 'expression';

export interface VariableBinding {
  source?: BindingSource | string;
  value?:  string;
  literalValue?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function bindingValue(binding: VariableBinding | undefined): string {
  if (!binding) return '';
  if (binding.source === 'literal') return binding.literalValue ?? binding.value ?? '';
  return binding.value ?? '';
}

/** True when a binding has a non-empty static value or variable path. */
export function isBindingConfigured(binding: VariableBinding | undefined): boolean {
  return bindingValue(binding).trim().length > 0;
}

export function validateBinding(
  nodeId:    string,
  nodeType:  string,
  nodeLabel: string,
  field:     string,
  label:     string,
  binding:   VariableBinding | undefined,
  required:  boolean,
): FloValidationIssue[] {
  const issues: FloValidationIssue[] = [];
  const source = (binding?.source ?? 'static') as BindingSource;
  const val    = bindingValue(binding).trim();

  if (!required) return issues;

  if (source === 'static' || source === 'literal') {
    if (!val) {
      issues.push({
        nodeId, nodeType, nodeLabel, field,
        code:     'REQUIRED_BINDING_MISSING',
        severity: 'error',
        message:  `${label} is required (static value is empty).`,
      });
    }
    return issues;
  }

  if (!val) {
    issues.push({
      nodeId, nodeType, nodeLabel, field,
      code:     'REQUIRED_BINDING_MISSING',
      severity: 'error',
      message:  source === 'expression'
        ? `${label} is required — enter a FloExpression.`
        : `${label} is required — set a ${source} path.`,
    });
    return issues;
  }

  if (source === 'expression') {
    const structural = structuralExpressionCheck(val);
    if (structural) {
      issues.push({
        nodeId, nodeType, nodeLabel, field,
        code: 'EXPRESSION_INVALID', severity: 'error',
        message: `${label}: ${structural}`,
      });
      return issues;
    }
    const parsed = validateFloExpression(val);
    if (!parsed.ok) {
      issues.push({
        nodeId, nodeType, nodeLabel, field,
        code: 'EXPRESSION_INVALID', severity: 'error',
        message: `${label}: ${parsed.message}`,
      });
    }
  }

  return issues;
}

export function validateEmailStatic(
  nodeId: string, nodeType: string, nodeLabel: string,
  field: string, label: string, raw: string,
): FloValidationIssue[] {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const bad = parts.filter(p => !EMAIL_RE.test(p));
  if (bad.length === 0) return [];
  return [{
    nodeId, nodeType, nodeLabel, field,
    code:     'REQUIRED_BINDING_MISSING',
    severity: 'error',
    message:  `${label}: invalid email address(es): ${bad.join(', ')}`,
  }];
}

/** Extract {{var}} placeholders from template / URL pattern. */
export function extractMustachePlaceholders(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Extract {{word}} URL variables (plug urlPattern style). */
export function extractUrlVariables(urlPattern: string): string[] {
  const out: string[] = [];
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(urlPattern)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function nodeLabel(data: Record<string, unknown>, fallback: string): string {
  return String(
    data.displayName ?? data.flaLabel ?? data.floActionName ?? data.plugName ?? data.label ?? fallback,
  );
}

/** Canvas card title — custom display name overrides palette label. */
export function nodeDisplayTitle(
  data: Record<string, unknown>,
  defaultTitle: string,
): string {
  const custom = data.displayName;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return defaultTitle;
}
