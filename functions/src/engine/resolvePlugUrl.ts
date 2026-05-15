// functions/src/engine/resolvePlugUrl.ts
import type { PlugVariableBinding } from '@floplug/shared';

export const resolvePlugUrl = (
  urlPattern: string,                                        // was baseUrl
  urlVariables: Record<string, PlugVariableBinding>,
  context: { cStream: any; globalVars: any; localVars: any }
): string => {
  return urlPattern.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    const binding = urlVariables?.[varName];
    if (!binding) return varName;

    switch (binding.source) {
      case 'static':  return binding.value;
      case 'cStream': return getNestedValue(context.cStream, binding.value) ?? '';
      case 'global':  return context.globalVars?.[binding.value] ?? '';
      case 'local':   return context.localVars?.[binding.value] ?? '';
      default:        return binding.value;
    }
  });
};

const getNestedValue = (obj: any, path: string): any =>
  path.split('.').reduce((acc, key) => acc?.[key], obj);