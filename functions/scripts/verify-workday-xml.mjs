/**
 * Quick check: Workday SOAP body shape (no duplicate root, wd: prefix, root attrs).
 * Run: node scripts/verify-workday-xml.mjs
 */
import { buildRequestBody } from '../lib/engine/buildRequestBody.js';

const actionDoc = {
  id: 'put_sales_item',
  connectorId: 'Workday',
  label: 'Put Sales Item',
  category: 'Custom',
  isActive: true,
  method: 'POST',
  endpoint: '/',
  schemaSource: 'wsdl',
  contentType: 'text/xml',
  soapAction: 'urn:com.workday/bsvc/Put_Sales_Item',
  operationName: 'Put_Sales_Item',
  requestBinding: {
    requestRootElement: 'Put_Sales_Item_Request',
    servicesSchemaVersion: 'v46.1',
  },
  inputSchema: [],
};

const resolvedLegacy = {
  'Put_Sales_Item_Request.Sales_Item_Data.Sales_Item_ID': 'SI-100245',
  'Put_Sales_Item_Request.Sales_Item_Data.Item_Name': 'Premium Support Add-on',
  'Put_Sales_Item_Request.Sales_Item_Data.Is_a_Bundle': 'false',
  'Put_Sales_Item_Request.Sales_Item_Data.Revenue_Category_Reference.ID': 'Software Services',
  'Put_Sales_Item_Request.Sales_Item_Data.Revenue_Category_Reference.ID.@type': 'Revenue_Category_ID',
};

const resolvedMulti = {
  ...resolvedLegacy,
  'Put_Sales_Item_Request.Sales_Item_Data.Customer_Reference.ID#Customer_ID': 'C1234',
  'Put_Sales_Item_Request.Sales_Item_Data.Customer_Reference.ID#Customer_Reference_ID': 'CUST-1234',
};

const xmlLegacy = buildRequestBody(actionDoc, resolvedLegacy);
const xmlMulti  = buildRequestBody(actionDoc, resolvedMulti);
const checks = [
  ['single root', !xmlLegacy.includes('</wd:Put_Sales_Item_Request><wd:Put_Sales_Item_Request')],
  ['ID value', xmlLegacy.includes('>Software Services</wd:ID>')],
  ['wd namespace', xmlLegacy.includes('xmlns:wd="urn:com.workday/bsvc"')],
  ['wd:version', xmlLegacy.includes('wd:version="v46.1"')],
  ['wd:Add_Only', xmlLegacy.includes('wd:Add_Only="true"')],
  ['wd:type on ID', xmlLegacy.includes('wd:type="Revenue_Category_ID"')],
  ['no bare type=', !xmlLegacy.match(/\stype="/)],
  ['multi Customer_ID', xmlMulti.includes('wd:type="Customer_ID"') && xmlMulti.includes('>C1234</wd:ID>')],
  ['multi Customer_Reference_ID', xmlMulti.includes('wd:type="Customer_Reference_ID"') && xmlMulti.includes('>CUST-1234</wd:ID>')],
  ['two ID siblings', (xmlMulti.match(/<wd:ID /g) ?? []).length >= 3],
];

const resolvedNewline = {
  ...resolvedLegacy,
  'Put_Sales_Item_Request.Sales_Item_Data.Item_Description':
    'Annual premium support package for enterprise\n                    customers',
};
const xmlNl = buildRequestBody(actionDoc, resolvedNewline);
checks.push([
  'description single line',
  xmlNl.includes(
    '<wd:Item_Description>Annual premium support package for enterprise customers</wd:Item_Description>',
  ),
]);
for (const [name, ok] of checks) {
  console.log(ok ? '✓' : '✗', name);
}
console.log('\n--- legacy body ---\n', xmlLegacy);
console.log('\n--- multi-ID body ---\n', xmlMulti);
