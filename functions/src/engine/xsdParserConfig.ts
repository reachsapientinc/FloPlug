/**
 * fast-xml-parser settings for Workday XSD — keep repeated wd:enumeration siblings as arrays.
 */

export const XSD_IS_ARRAY_TAG_NAMES = new Set([
  'xsd:element', 'element',
  'xsd:complexType', 'complexType',
  'xsd:simpleType', 'simpleType',
  'xsd:group', 'group',
  'xsd:sequence', 'sequence',
  'xsd:choice', 'choice',
  'xsd:all', 'all',
  'xsd:enumeration', 'enumeration',
  'wd:enumeration',
  'xsd:annotation', 'annotation',
  'xsd:appinfo', 'appinfo',
  'wd:appinfo', 'appinfo',
  'xsd:import', 'import',
  'xsd:include', 'include',
]);

/** Tag names that must always parse as arrays (incl. namespaced Workday tags). */
export function xsdParserIsArrayTag(tagName: string): boolean {
  if (XSD_IS_ARRAY_TAG_NAMES.has(tagName)) return true;
  const local = tagName.includes(':') ? tagName.split(':').pop()! : tagName;
  if (local === 'enumeration' || local === 'appinfo' || local === 'annotation') return true;
  return XSD_IS_ARRAY_TAG_NAMES.has(local);
}
