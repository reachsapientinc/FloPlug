/**
 * Validates an entire flo graph (topology + per-node rules).
 */
import type { FloValidationReport, ValidateFloGraphInput } from '../types/floValidation.js';
export declare function validateFloGraph(input: ValidateFloGraphInput): FloValidationReport;
