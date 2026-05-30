import { isFieldEffectivelyRequired, isMappingBranchActivated, isImplicitOptionalContainer, } from '@floplug/shared';
function assert(cond, msg) {
    if (!cond)
        throw new Error(msg);
}
const ROOT = 'Put_Sales_Item_Request';
const IMAGE = `${ROOT}.Sales_Item_Data.Primary_Image_Data`;
const IMAGE_DATA = `${IMAGE}.Image_Data`;
const FILENAME = `${IMAGE_DATA}.Filename`;
// With optional container rows (new flatten)
const schemaWithContainers = [
    {
        path: IMAGE,
        label: 'Primary Image Data',
        xsdType: 'object',
        required: false,
        repeating: false,
        minOccurs: '0',
    },
    {
        path: IMAGE_DATA,
        label: 'Image Data',
        xsdType: 'object',
        required: false,
        repeating: false,
        minOccurs: '0',
    },
    {
        path: FILENAME,
        label: 'Filename',
        xsdType: 'string',
        required: true,
        repeating: false,
        minOccurs: '1',
        optionalAncestorPaths: [IMAGE, IMAGE_DATA],
    },
];
assert(!isFieldEffectivelyRequired(schemaWithContainers[2], schemaWithContainers, {}, []), 'Filename not required when optional image branch is inactive');
assert(isFieldEffectivelyRequired(schemaWithContainers[2], schemaWithContainers, {}, [{ targetField: `${IMAGE_DATA}.File_Content` }]), 'Filename required when image branch is mapped');
// Legacy flatten: only Filename leaf, no container rows
const schemaLegacyLeafOnly = [
    {
        path: FILENAME,
        label: 'Filename',
        xsdType: 'string',
        required: true,
        repeating: false,
        minOccurs: '1',
    },
];
assert(isImplicitOptionalContainer(IMAGE, schemaLegacyLeafOnly), 'Primary_Image_Data inferred optional without container row');
assert(!isFieldEffectivelyRequired(schemaLegacyLeafOnly[0], schemaLegacyLeafOnly, {}, []), 'Filename not required via implicit optional Primary_Image_Data');
assert(isMappingBranchActivated(IMAGE, {}, [{ targetField: FILENAME }]), 'Mapping Filename activates image branch');
console.log('floActionFieldRequired tests passed');
