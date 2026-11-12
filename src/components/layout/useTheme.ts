'use client';

import { useEffect, useState } from 'react';

/** Reads the theme applied before first paint and lets any screen switch it. */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch { /* storage may be blocked */ }
    setTheme(next);
  };
  return { theme, toggle };
}
