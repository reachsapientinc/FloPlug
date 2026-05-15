/**
 * src/utils/transformEngine.ts
 */

export type TransformAction = 'upper' | 'lower' | 'round' | 'trim' | 'json' | 'string';

const transformRegistry: Record<string, (val: any) => any> = {
  upper:  (v) => String(v ?? '').toUpperCase(),
  lower:  (v) => String(v ?? '').toLowerCase(),
  round:  (v) => isNaN(Number(v)) ? v : Math.round(Number(v)),
  trim:   (v) => String(v ?? '').trim(),
  json:   (v) => typeof v === 'string' ? JSON.parse(v) : v,
  string: (v) => typeof v === 'object' ? JSON.stringify(v) : String(v),
};

/**
 * Universal transform runner
 * @param value The raw data to transform
 * @param transformCode The key from our registry (e.g., 'upper')
 */
export const applyTransform = (value: any, transformCode: string): any => {
  if (!transformCode) return value;
  
  const fn = transformRegistry[transformCode.trim().toLowerCase()];
  if (fn) return fn(value);

  // If no registry match, return original (or handle custom expressions later)
  return value;
};

/**
 * Helper to parse and apply a mapping string like "field | transform"
 */
export const executeMapping = (item: any, mappingStr: string, getValueFn: any): any => {
  // Handles "sourceField | transformCode"
  const [srcPart, ...rest] = mappingStr.split('|').map(s => s.trim());
  const transformCode = rest.join('|'); // handles pipe characters in future logic
  
  const rawValue = getValueFn(item, srcPart);
  return applyTransform(rawValue, transformCode);
};