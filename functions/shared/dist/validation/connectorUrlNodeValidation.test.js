import { findUnresolvedUrlPlaceholders, normalizeKitUrlContext, resolveConnectorUrlPreview, validateConnectorUrlNode, } from '@floplug/shared';
function assert(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
assert(findUnresolvedUrlPlaceholders('https://x.com/{Tenant}/v1').includes('Tenant'), 'single-brace segment');
assert(findUnresolvedUrlPlaceholders('https://x.com/{{tenant}}/api').includes('tenant'), 'mustache segment');
assert(findUnresolvedUrlPlaceholders('https://x.com/acme/v1').length === 0, 'fully resolved url');
const tokens = [
    { key: 'urlToken1', label: 'Scheme', source: 'static', staticValue: 'https:' },
    { key: 'urlToken2', label: 'Host', source: 'connection', field: 'hostname' },
    { key: 'urlToken3', label: 'Module', source: 'kit', field: 'serviceModule' },
    { key: 'urlToken4', label: 'Version', source: 'kit', field: 'serviceVersion' },
];
const issues = validateConnectorUrlNode({
    nodeId: 'n1',
    nodeType: 'plugNode',
    nodeLabel: 'Test Plug',
    connectionId: 'conn-1',
    connection: { hostname: 'api.example.com' },
    urlTokens: tokens,
    kit: {},
});
assert(issues.length > 0, 'missing kit module should error');
assert(issues[0].code === 'URL_VARIABLE_UNBOUND', 'error code');
const ok = validateConnectorUrlNode({
    nodeId: 'n1',
    nodeType: 'plugNode',
    nodeLabel: 'Test Plug',
    connectionId: 'conn-1',
    connection: { hostname: 'api.example.com' },
    urlTokens: tokens,
    kit: { serviceModule: 'Human_Resources', serviceVersion: 'v46.1' },
});
assert(ok.length === 0, 'complete kit + connection should pass');
const floActionKit = validateConnectorUrlNode({
    nodeId: 'fa1',
    nodeType: 'floActionNode',
    nodeLabel: 'Put Sales Item',
    connectionId: 'conn-1',
    connection: { hostname: 'wd2-impl-services1.workday.com', tenantKey: 'acme' },
    urlTokens: tokens,
    kit: { schemaLabel: 'Resource Management v46.1', schemaVersion: '46.1' },
});
assert(floActionKit.length === 0, 'kit module/version from schema label should resolve');
const kitFromUrlTokenValues = normalizeKitUrlContext({
    urlTokenValues: { urlToken3: 'Resource_Management', urlToken4: 'v46.1' },
}, 'Sales_Item', tokens);
const previewFromKit = resolveConnectorUrlPreview({
    urlTokens: tokens,
    connection: { hostname: 'wd2-impl-services1.workday.com' },
    kit: kitFromUrlTokenValues,
});
assert(!previewFromKit.includes('{Module}'), 'urlTokenValues on kit should resolve Module label');
assert(!previewFromKit.includes('{Version}'), 'urlTokenValues on kit should resolve Version label');
assert(previewFromKit.includes('Resource_Management'), 'module segment in preview');
assert(previewFromKit.includes('v46.1'), 'version segment in preview');
const legacyIssues = validateConnectorUrlNode({
    nodeId: 'n2',
    nodeType: 'plugNode',
    nodeLabel: 'Legacy',
    connectionId: 'conn-1',
    legacyUrlPattern: 'https://host/{{path}}/item',
    legacyUrlVariables: {},
});
assert(legacyIssues.some(i => i.message.includes('{{path}}')), 'legacy mustache unresolved');
console.log('connectorUrlNodeValidation.test.ts: ok');
