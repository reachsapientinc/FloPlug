import { getValue, setValue } from '../utils/pathUtils.js';
import { applyTransform } from '../utils/transformEngine.js'; // Reusing your engine

export const executeMapper = (payload: any, nodeData: any) => {
  const mappings = (nodeData.mappings as string[]) ?? [];
  const mapMode = (nodeData.mapMode as string) ?? 'pure';

  const mapItem = (item: any) => {
  // 1. Safe check: Only stop if item is truly null/undefined
  if (item === null || item === undefined) return {};
  
  const res: any = (mapMode === 'transform') ? { ...item } : {};
   
  for (const m of mappings) {
    // 2. Split by arrow first (Standardizes the mapping)
    const parts = m.split(/→|->|=>/).map(s => s.trim());
    if (parts.length < 2) continue;

    const mappingPart = parts[0]; 
    const tgt = parts[1];
    console.log(`[mappingPart] : ${mappingPart}`);

    let srcPath: string;
    let transformCode: string | undefined;

    // 3. Only split by pipe if it exists
    if (mappingPart.includes('|')) {
      const sub = mappingPart.split('|').map(s => s.trim());
      srcPath = sub[0];
      transformCode = sub[1];
    } else {
      srcPath = mappingPart;
      transformCode = undefined;
    }

    console.log(`[srcPath] : ${srcPath}`);
     console.log(`[transformCode] : ${transformCode}`);

    // 4. Get value
    let val = getValue(item, srcPath);
    
    console.log(`[val] : ${val}`);

// 5. Apply and Set
    if (val !== undefined) {
      if (transformCode) {
        val = applyTransform(val, transformCode);
        console.log(`after applying [transformCode] [val] : ${val}`);
      }
      setValue(res, tgt, val);

      if (mapMode === 'transform' && srcPath !== tgt) {
        delete res[srcPath];
      }
    }
  }
  return res;
};

  return Array.isArray(payload) ? payload.map(mapItem) : mapItem(payload);
};