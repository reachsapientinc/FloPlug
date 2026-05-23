/**
 * FloValidation — design-time graph validation (shared client + server).
 */
export function buildFloValidationReport(issues, nodeSnapshots, meta) {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const infos = issues.filter(i => i.severity === 'info');
    return {
        floId: meta?.floId,
        floName: meta?.floName,
        validatedAt: new Date().toISOString(),
        nodeSnapshots,
        errors,
        warnings,
        infos,
        canSave: true,
        canPublish: errors.length === 0,
        canRunProduction: errors.length === 0,
    };
}
export function summarizeValidation(report) {
    return {
        errorCount: report.errors.length,
        warningCount: report.warnings.length,
        nodeCount: report.nodeSnapshots.length,
    };
}
