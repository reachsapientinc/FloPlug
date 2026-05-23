/**
 * URL template variables resolved from FloConnection (not set by developers on canvas).
 */
const CONNECTION_URL_VAR_NAMES = new Set([
  'hostname',
  'host',
  'tenant',
  'tenantkey',
  'tenantid',
  'instance',
  'org',
  'organization',
  'company',
  'environment',
  'env',
  'baseurl',
  'base_url',
  'server',
  'domain',
]);

export function isConnectionBackedPlugUrlVar(varName: string): boolean {
  return CONNECTION_URL_VAR_NAMES.has(varName.toLowerCase());
}

/** Variables a developer may bind on a plug node (e.g. module, version). */
export function isDeveloperPlugUrlVar(varName: string): boolean {
  return !isConnectionBackedPlugUrlVar(varName);
}

export function extractUrlTemplateVarNames(urlPattern: string): string[] {
  const names = new Set<string>();
  for (const m of urlPattern.matchAll(/\{\{(\w+)\}\}/g)) {
    names.add(m[1]);
  }
  return [...names];
}
