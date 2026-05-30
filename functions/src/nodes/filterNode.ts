/**
 * functions/src/nodes/filterNode.ts
 *
 * Evaluates one or more condition groups against cStream.
 * Supports both single-object and array cStream.
 *
 * Compare: resolve left (field) and right (value) from cStream/local/global/static/expression,
 * then apply relational operator (==, !=, >, <, >=, <=).
 * Legacy: operator "expression" (boolean expr in value), contains, startsWith.
 *
 * onSkip behaviour:
 *   'stop'     — returns null, terminating this path in the flow
 *   'passEmpty' — returns {} (or []) so the flow continues downstream
 */

import {
  evaluateFilterCondition,
  evaluateConditionRows,
  type FloRunMeta,
  type NodeResult,
  type NodeStore,
  type ConditionGroup,
  type ConditionRow,
} from '@floplug/shared';

function evaluateGroup(
  item: Record<string, unknown>,
  group: ConditionGroup,
  store?: NodeStore,
  floRunMeta?: Readonly<FloRunMeta>,
): boolean {
  if (!group.conditions?.length) return true;
  return group.logic === 'OR'
    ? group.conditions.some(c  => evaluateFilterCondition(item, c, store, floRunMeta))
    : group.conditions.every(c => evaluateFilterCondition(item, c, store, floRunMeta));
}

export function executeFilterNode(
  cStream: unknown,
  nd:      Record<string, unknown>,
  store:   NodeStore,
  floRunMeta?: Readonly<FloRunMeta>,
): NodeResult {
  const onSkip = String(nd.onSkip ?? 'stop');
  const itemOf = (item: unknown): Record<string, unknown> =>
    (item && typeof item === 'object' && !Array.isArray(item))
      ? item as Record<string, unknown>
      : {};

  const conditionRows = nd.conditionRows as ConditionRow[] | undefined;
  if (Array.isArray(conditionRows) && conditionRows.length > 0) {
    const evalItem = (item: unknown) =>
      evaluateConditionRows(conditionRows, itemOf(item), store, floRunMeta);

    if (Array.isArray(cStream)) {
      const filtered = cStream.filter(evalItem);
      const result   = filtered.length === 0 && onSkip === 'stop' ? null : filtered;
      return {
        cStream: result,
        logLine: `✓ Filter (rows): ${Array.isArray(result) ? result.length : 0}/${cStream.length}`,
      };
    }

    const passes = evalItem(cStream);
    return {
      cStream: passes ? cStream : (onSkip === 'stop' ? null : {}),
      logLine: `✓ Filter (rows): ${passes ? 'PASS' : `FAIL (${onSkip})`}`,
    };
  }

  if (Array.isArray(nd.conditionGroups) && (nd.conditionGroups as ConditionGroup[]).length > 0) {
    const groups  = nd.conditionGroups as ConditionGroup[];
    const evalItem = (item: unknown) => groups.every(g => evaluateGroup(itemOf(item), g, store, floRunMeta));

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

  const cond = {
    field:       String(nd.field ?? ''),
    fieldSource: nd.fieldSource as import('@floplug/shared').FilterOperandSource | undefined,
    operator:    String(nd.operator ?? '=='),
    value:       String(nd.value ?? ''),
    valueSource: nd.valueSource as import('@floplug/shared').FilterOperandSource | undefined,
  };

  if (Array.isArray(cStream)) {
    const filtered = cStream.filter(item => evaluateFilterCondition(itemOf(item), cond, store, floRunMeta));
    const result   = filtered.length === 0 && onSkip === 'stop' ? null : filtered;
    return {
      cStream: result,
      logLine: `✓ Filter: ${Array.isArray(result) ? result.length : 0}/${cStream.length}`,
    };
  }

  const passes = evaluateFilterCondition(itemOf(cStream), cond, store, floRunMeta);
  return {
    cStream: passes ? cStream : (onSkip === 'stop' ? null : {}),
    logLine: `✓ Filter: ${passes ? 'PASS' : `FAIL (${onSkip})`}`,
  };
}
