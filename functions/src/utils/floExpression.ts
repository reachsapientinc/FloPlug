/**
 * Re-export FloExpression engine from shared (single source of truth).
 */
export {
  evalExpression,
  safeEvalExpression,
  looksLikeExpression,
  validateFloExpression,
  structuralExpressionCheck,
  FLO_EXPRESSION_FUNCTIONS,
  type EvalContext,
  type FloValue,
  type FloExpressionValidation,
} from '@floplug/shared';
