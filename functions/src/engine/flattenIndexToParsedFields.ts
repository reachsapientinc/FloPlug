/**
 * Convert pre-compiled flatten rows → ParsedField[] for mapper / engine.
 */

import type { FlattenedOperationIndex } from '@floplug/shared';
import type { ParsedField } from '@floplug/shared';

function toLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim();
}

export function flattenRowsToParsedFields(
  op: FlattenedOperationIndex,
): ParsedField[] {
  const fields: ParsedField[] = [];
  const seen = new Set<string>();

  const push = (f: ParsedField) => {
    if (seen.has(f.path)) return;
    seen.add(f.path);
    fields.push(f);
  };

  for (const row of op.fields) {
    const typeEnums = row.idTypes ?? row.typeEnumeration;
    if (typeEnums?.length) {
      if (row.referencePattern === 'simple_content') {
        push({
          path:        row.mapperPath,
          label:       toLabel(row.name),
          xsdType:     'string',
          required:    row.required,
          repeating:   row.maxOccurs === 'unbounded',
          helpText:    'ID value (element text)',
        });
        push({
          path:        `${row.mapperPath}.@type`,
          label:       'type',
          xsdType:     'enumeration',
          required:    row.required,
          repeating:   false,
          enumValues:  typeEnums,
          helpText:    `Allowed wd:type: ${typeEnums.join(', ')}`,
        });
      } else {
        push({
          path:     row.mapperPath,
          label:    toLabel(row.name),
          xsdType:  'Reference',
          required: false,
          repeating: row.maxOccurs === 'unbounded',
        });
        push({
          path:     `${row.mapperPath}.ID`,
          label:    'ID',
          xsdType:  'string',
          required: row.required,
          repeating: false,
        });
        push({
          path:        `${row.mapperPath}.ID.@type`,
          label:       'type',
          xsdType:     'enumeration',
          required:    row.required,
          repeating:   false,
          enumValues:  typeEnums,
          helpText:    `Allowed wd:type: ${typeEnums.join(', ')}`,
        });
      }
      continue;
    }

    if (row.dataType === 'Reference' || row.referencePattern) {
      push({
        path:     row.mapperPath,
        label:    toLabel(row.name),
        xsdType:  'Reference',
        required: row.required,
        repeating: row.maxOccurs === 'unbounded',
        minOccurs: row.minOccurs,
        helpText: 'Map ID value and wd:type in mapper panel',
      });
      continue;
    }

    if (row.dataType === 'object') {
      push({
        path:      row.mapperPath,
        label:     toLabel(row.name),
        xsdType:   'object',
        required:  row.required,
        repeating: row.maxOccurs === 'unbounded' || (row.maxOccurs != null && row.maxOccurs !== '1'),
        minOccurs: row.minOccurs,
        optionalAncestorPaths: row.optionalAncestorPaths,
        helpText:  row.required ? undefined : 'Optional section — map inner fields only when needed',
      });
      continue;
    }

    const repeating = row.maxOccurs === 'unbounded'
      || (row.maxOccurs != null && row.maxOccurs !== '1');

    push({
      path:      row.mapperPath,
      label:     toLabel(row.name),
      xsdType:   row.dataType,
      required:  row.required,
      repeating,
      minOccurs: row.minOccurs,
      optionalAncestorPaths: row.optionalAncestorPaths,
      helpText:  row.notes,
    });
  }

  return fields;
}
