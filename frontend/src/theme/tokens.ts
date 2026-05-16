export const palettes = {
  designer: {
    bg:           '#0f1117',
    surface:      '#181b24',
    panel:        '#141720',
    panelBorder:  'rgba(255,255,255,0.06)',
    border:       'rgba(255,255,255,0.08)',
    textPrimary:  '#f0f0f4',
    textSecondary:'#c0c0cc',
    textMuted:    '#6b6b80',
    textDim:      '#3a3a50',
    label:        '#45455a',
    accent:       '#4f8ef7',
    danger:       '#f87171',
    success:      '#22c55e',
    warning:      '#f59e0b',
    inputBg:      '#0f1117',
    inputText:    '#ffffff',
    codeBg:       '#0a0c12',
    codeText:     '#22c55e',
    sectionBg:    'rgba(255,255,255,0.02)',
    sectionBorder:'rgba(255,255,255,0.07)',
  },
} as const;

export type DesignerPalette = typeof palettes.designer;
