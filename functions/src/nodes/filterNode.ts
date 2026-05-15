/**
 * functions/src/nodes/filterNode.ts
 *
 * Evaluates one or more condition groups against cStream.
 * Supports both single-object and array cStream.
 *
 * onSkip behaviour:
 *   'stop'     — returns null, terminating this path in the flow
 *   'passEmpty' — returns {} (or []) so the flow continues downstream
 */

import { getValue } from '../utils/pathUtils.js';
import type { NodeResult, NodeStore, ConditionGroup } from '@floplug/shared';

// ── Single condition evaluator ────────────────────────────────────────────────

function evaluateCondition(
  item: any,
  cond: { field: string; operator: string; value: string },
): boolean {
  const actual = getValue(item, cond.field);
  switch (cond.operator) {
    case '==':         return actual == cond.value;
    case '!=':         return actual != cond.value;
    case '>':          return Number(actual) >  Number(cond.value);
    case '<':          return Number(actual) <  Number(cond.value);
    case '>=':         return Number(actual) >= Number(cond.value);
    case '<=':         return Number(actual) <= Number(cond.value);
    case 'contains':   return String(actual ?? '').includes(cond.value);
    case 'startsWith': return String(actual ?? '').startsWith(cond.value);
    default:           return false;
  }
}

// ── Condition group evaluator ─────────────────────────────────────────────────

function evaluateGroup(item: any, group: ConditionGroup): boolean {
  if (!group.conditions?.length) return true;
  return group.logic === 'OR'
    ? group.conditions.some(c  => evaluateCondition(item, c))
    : group.conditions.every(c => evaluateCondition(item, c));
}

// ── Main executor ─────────────────────────────────────────────────────────────

export function executeFilterNode(
  cStream: unknown,
  nd:      Record<string, any>,
  _store:  NodeStore,
): NodeResult {
  const onSkip = String(nd.onSkip ?? 'stop');

  // ── Multi-group mode ──────────────────────────────────────────────────────
  if (Array.isArray(nd.conditionGroups) && nd.conditionGroups.length > 0) {
    const groups  = nd.conditionGroups as ConditionGroup[];
    const evalItem = (item: any) => groups.every(g => evaluateGroup(item, g));

    if (Array.isArray(cStream)) {
      const filtered = cStream.filter(evalItem);
      const result   = filtered.length === 0 && onSkip === 'stop' ? null : filtered;
      return {
        cStream: result,
        logLine: `✓ Filter (multi): ${Array.isArray(result) ? result.length : 0}/${cStream.length}`,
      };
    }

    const passes = evalItem(cStream);
    return {
      cStream: passes ? cStream : (onSkip === 'stop' ? null : {}),
      logLine: `✓ Filter: ${passes ? 'PASS' : `FAIL (${onSkip})`}`,
    };
  }

  // ── Single condition mode ─────────────────────────────────────────────────
  const cond = {
    field:    nd.field    as string,
    operator: nd.operator as string,
    value:    nd.value    as string,
  };

  if (Array.isArray(cStream)) {
    const filtered = cStream.filter(item => evaluateCondition(item, cond));
    const result   = filtered.length === 0 && onSkip === 'stop' ? null : filtered;
    return {
      cStream: result,
      logLine: `✓ Filter: ${Array.isArray(result) ? result.length : 0}/${cStream.length}`,
    };
  }

  const passes = evaluateCondition(cStream, cond);
  return {
    cStream: passes ? cStream : (onSkip === 'stop' ? null : {}),
    logLine: `✓ Filter: ${passes ? 'PASS' : `FAIL (${onSkip})`}`,
  };
}
