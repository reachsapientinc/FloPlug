/**
 * Verify Workday wd:enumeration (multiple values in appinfo) are all captured.
 * Run: node scripts/verify-wd-enumeration.mjs
 */
import { XMLParser } from 'fast-xml-parser';
import { xsdParserIsArrayTag } from '../lib/engine/xsdParserConfig.js';
import {
  resolveTypeEnumerationsInSchema,
  resolveReferenceIdEnumerations,
} from '../lib/engine/xsdEnumResolver.js';

const sampleXsd = `<?xml version="1.0"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:wd="urn:com.workday/bsvc">
  <xsd:simpleType name="Revenue_CategoryReferenceEnumeration">
    <xsd:restriction base="xsd:string">
      <xsd:annotation>
        <xsd:appinfo>
          <wd:enumeration value="WID"/>
          <wd:enumeration value="Revenue_Category_ID"/>
        </xsd:appinfo>
      </xsd:annotation>
    </xsd:restriction>
  </xsd:simpleType>
  <xsd:complexType name="Revenue_Category_ReferenceType">
    <xsd:sequence>
      <xsd:element name="ID" type="xsd:string" maxOccurs="unbounded"/>
    </xsd:sequence>
    <xsd:attribute name="type" type="Revenue_CategoryReferenceEnumeration"/>
  </xsd:complexType>
</xsd:schema>`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => xsdParserIsArrayTag(name),
});

const schema = parser.parse(sampleXsd)['xsd:schema'];
const restriction = schema['xsd:simpleType'][0]['xsd:restriction'];
const wdEnums = [].concat(
  restriction?.['xsd:annotation']?.[0]?.['xsd:appinfo']?.[0]?.['wd:enumeration'] ?? [],
);

const fromType = resolveTypeEnumerationsInSchema(schema, 'Revenue_CategoryReferenceEnumeration');
const fromRef  = resolveReferenceIdEnumerations('Revenue_Category_Reference', schema, {
  rawTypeName: 'Revenue_Category_ReferenceType',
});

const checks = [
  ['parser keeps 2 wd:enumeration nodes', wdEnums.length === 2],
  ['type resolver has WID', fromType.includes('WID')],
  ['type resolver has Revenue_Category_ID', fromType.includes('Revenue_Category_ID')],
  ['reference resolver has WID', fromRef.idTypes.includes('WID')],
  ['reference resolver has Revenue_Category_ID', fromRef.idTypes.includes('Revenue_Category_ID')],
];

for (const [name, ok] of checks) {
  console.log(ok ? '✓' : '✗', name);
}
console.log('\nfromType:', fromType);
console.log('fromRef.idTypes:', fromRef.idTypes);
