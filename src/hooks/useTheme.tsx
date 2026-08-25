'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ThemeContextType {
  theme: 'light' | 'dark'; toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme: 'light' | 'dark' = 'light';
  // บังคับโหมดสว่างเท่านั้น — ลบปุ่มสลับโหมดมืดตามคำขอ
  useEffect(() => {
    localStorage.removeItem('ladprao_theme');
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
  }, []);

  const toggleTheme = () => {
    // no-op: โหมดมืดถูกนำออก
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
