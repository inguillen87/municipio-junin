import { useLayoutEffect, useState, type ReactNode } from 'react';

import { Topbar, type TopbarIdentity, type TopbarLink } from './Topbar';

const THEME_STORAGE_KEY = 'municontrol-color-theme:v1';

function initialTheme(): 'light' | 'dark' {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
  } catch {
    // A restricted browser can deny localStorage without blocking the dashboard.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface AppShellProps {
  children: ReactNode;
  identity: TopbarIdentity | null;
  links: readonly TopbarLink[];
  busy: boolean;
}

export function AppShell({ children, identity, links, busy }: AppShellProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is optional; the active theme still works.
    }
  }, [theme]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido-principal">Saltar al contenido principal</a>
      <Topbar
        identity={identity}
        links={links}
        theme={theme}
        onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
      />
      <main id="contenido-principal" className="main-content" aria-busy={busy}>
        {children}
      </main>
    </div>
  );
}
