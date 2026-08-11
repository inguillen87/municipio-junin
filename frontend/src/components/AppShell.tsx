import { useLayoutEffect, useState, type ReactNode } from 'react';

import type { SessionIdentity } from '../auth/session';
import { MuniGuiaBridge } from './MuniGuiaBridge';
import { Topbar, type TopbarLink } from './Topbar';

const THEME_STORAGE_KEY = 'municontrol-color-theme:v1';
const LEGACY_THEME_STORAGE_KEY = 'govtech_theme';

type ThemePreference = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialThemePreference(): ThemePreference {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'auto') return storedTheme;
    const legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'auto') return legacyTheme;
  } catch {
    // A restricted browser can deny localStorage without blocking the dashboard.
  }

  return systemTheme();
}

interface AppShellProps {
  children: ReactNode;
  identity: SessionIdentity | null;
  links: readonly TopbarLink[];
  busy: boolean;
}

export function AppShell({ children, identity, links, busy }: AppShellProps) {
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialThemePreference);
  const [preferredSystemTheme, setPreferredSystemTheme] = useState<ResolvedTheme>(systemTheme);
  const theme = themePreference === 'auto' ? preferredSystemTheme : themePreference;

  useLayoutEffect(() => {
    if (themePreference !== 'auto' || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const synchronizeTheme = () => setPreferredSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    synchronizeTheme();
    mediaQuery.addEventListener('change', synchronizeTheme);
    return () => mediaQuery.removeEventListener('change', synchronizeTheme);
  }, [themePreference]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
      window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, themePreference);
    } catch {
      // Theme persistence is optional; the active theme still works.
    }
  }, [theme, themePreference]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">Saltar al contenido principal</a>
      <Topbar
        identity={identity}
        links={links}
        theme={theme}
        onToggleTheme={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
      />
      <main id="contenido-principal" className="main-content" aria-busy={busy}>
        {children}
      </main>
      <MuniGuiaBridge identity={identity} />
    </div>
  );
}
