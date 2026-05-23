/**
 * Load XSD from Cloud Storage with include/import merge (incl. simpleType).
 */

import { getStorage } from 'firebase-admin/storage';
import { XMLParser } from 'fast-xml-parser';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import { xsdParserIsArrayTag } from './xsdParserConfig.js';

const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => xsdParserIsArrayTag(name),
});

function dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

function joinPath(baseDir: string, rel: string): string {
  if (!rel) return baseDir;
  if (rel.startsWith('/')) return rel.slice(1);
  if (baseDir.endsWith('/')) return `${baseDir}${rel}`;
  return `${baseDir}/${rel}`;
}

export function mergeSchemaObjects(target: any, source: any): void {
  const keys = [
    'xsd:element', 'element',
    'xsd:complexType', 'complexType',
    'xsd:simpleType', 'simpleType',
    'xsd:group', 'group',
  ];
  for (const key of keys) {
    const src = [].concat(source[key] ?? []);
    if (!src.length) continue;
    const existing = [].concat(target[key] ?? []);
    const seen = new Set(existing.map((x: any) => x?.['@_name']).filter(Boolean));
    for (const item of src) {
      const name = item?.['@_name'];
      if (!name || !seen.has(name)) existing.push(item);
      if (name) seen.add(name);
    }
    target[key] = existing;
  }
}

export async function loadAndMergeXsdSchema(
  storagePath: string,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<any> {
  if (depth > 8) {
    throw new Error(`XSD dependency depth exceeded while loading ${storagePath}`);
  }
  if (visited.has(storagePath)) return {};
  visited.add(storagePath);

  const [buf] = await storageBucket.file(storagePath).download();
  const raw = buf.toString('utf-8');
  const parsed = xmlParser.parse(raw);
  const schema = parsed['xsd:schema'] ?? parsed['schema'] ?? {};

  const refs: any[] = []
    .concat(schema['xsd:include'] ?? schema['include'] ?? [])
    .concat(schema['xsd:import'] ?? schema['import'] ?? []);
  const baseDir = dirname(storagePath);

  for (const ref of refs) {
    const schemaLocation = (ref?.['@_schemaLocation'] as string | undefined) ?? '';
    if (!schemaLocation || /^https?:\/\//i.test(schemaLocation)) continue;
    const depPath = joinPath(baseDir, schemaLocation);
    try {
      const depSchema = await loadAndMergeXsdSchema(depPath, visited, depth + 1);
      mergeSchemaObjects(schema, depSchema);
    } catch (err) {
      console.warn(`[xsdSchemaMerge] failed to load XSD dependency ${depPath}: ${err}`);
    }
  }

  return schema;
}

/** Resolve primary XSD storage path for a WSDL or XSD upload. */
export async function resolvePrimaryXsdStoragePath(
  storagePath: string,
  schemaType: string,
): Promise<string> {
  if (schemaType === 'xsd') return storagePath;

  const [buf] = await storageBucket.file(storagePath).download();
  const raw = buf.toString('utf-8');
  const parsed = xmlParser.parse(raw);
  const definitions = parsed['wsdl:definitions'] ?? parsed['definitions'] ?? {};
  const types = definitions['wsdl:types'] ?? definitions['types'] ?? {};
  const schema = types['xsd:schema'] ?? types['schema'] ?? types;
  if (!schema || typeof schema !== 'object') {
    throw new Error(`WSDL ${storagePath} has no xsd:schema in wsdl:types`);
  }

  const refs: any[] = []
    .concat(schema['xsd:include'] ?? schema['include'] ?? [])
    .concat(schema['xsd:import'] ?? schema['import'] ?? []);
  const baseDir = dirname(storagePath);

  for (const ref of refs) {
    const loc = (ref?.['@_schemaLocation'] as string | undefined) ?? '';
    if (!loc || /^https?:\/\//i.test(loc)) continue;
    if (/\.xsd$/i.test(loc)) return joinPath(baseDir, loc);
  }

  const guess = storagePath.replace(/\.wsdl$/i, '.xsd');
  const [exists] = await storageBucket.file(guess).exists();
  if (exists) return guess;

  throw new Error(
    `Could not resolve XSD for WSDL ${storagePath}. ` +
    'Upload the data model XSD in the same folder or use an xsd import with a local .xsd path.',
  );
}
