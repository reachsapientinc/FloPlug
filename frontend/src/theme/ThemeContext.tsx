import React, { createContext, useContext } from 'react';
import { palettes, type DesignerPalette } from './tokens';

const ThemeContext = createContext<DesignerPalette>(palettes.designer);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeContext.Provider value={palettes.designer}>{children}</ThemeContext.Provider>
);

export function useTheme(): DesignerPalette {
  return useContext(ThemeContext);
}
