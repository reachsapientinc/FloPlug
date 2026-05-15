// packages/shared/src/types/storage.ts
export const buildSchemaPath = (connectorId, version, fileName) => {
    const safeVersion = version.replace(/\s/g, "_");
    return `schemas/${connectorId}/${safeVersion}/${fileName}`;
};
