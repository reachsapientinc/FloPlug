/**
 * Pre-compiled XSD field index — built at schema upload, consumed by mapper / engine.
 */
export interface FlattenedFieldRow {
    xmlPath: string;
    mapperPath: string;
    name: string;
    kind: 'element' | 'attribute';
    dataType: string;
    /** Allowed wd:type values for Workday references (mapper + SOAP). */
    idTypes?: string[];
    /** Same as idTypes — explicit name for flatten.json consumers. */
    typeEnumeration?: string[];
    /** Workday reference: nested ID child vs simpleContent value + @type */
    referencePattern?: 'nested_id' | 'simple_content';
    required: boolean;
    minOccurs?: string;
    maxOccurs?: string;
    notes?: string;
}
export interface FlattenedOperationIndex {
    /** WSDL / business operation key, e.g. Put_Sales_Item */
    operationName: string;
    /** XSD request root element, e.g. Put_Sales_Item_Request */
    requestRootElement: string;
    fields: FlattenedFieldRow[];
}
export interface SchemaFlattenIndex {
    version: string;
    sourceFile: string;
    schemaType: string;
    compiledAt: string;
    operations: Record<string, FlattenedOperationIndex>;
}
