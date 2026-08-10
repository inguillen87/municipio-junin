export interface TopbarIdentity {
  name: string;
  role: string;
  tenant: string;
}

interface TopbarProps {
  identity: TopbarIdentity | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

function ThemeIcon({ theme }: Pick<TopbarProps, 'theme'>) {
  return theme === 'dark' ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path d="M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path d="M20.5 14.2A8 8 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
    </svg>
  );
}

export function Topbar({ identity, theme, onToggleTheme }: TopbarProps) {
  const nextTheme = theme === 'dark' ? 'claro' : 'oscuro';

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="brand" href="/inicio.html" aria-label="MuniControl, ir al espacio de trabajo">
          <span className="brand__mark" aria-hidden="true">MJ</span>
          <span className="brand__copy">
            <strong>MuniControl</strong>
            <small>Municipalidad de Junín</small>
          </span>
        </a>

        <nav className="topbar__nav" aria-label="Navegación de la vista">
          <a href="/inicio.html">Inicio</a>
          <a href="/control.html">Versión estable</a>
        </nav>

        <div className="topbar__tools">
          {identity ? (
            <div className="identity" aria-label={`Sesión de ${identity.name}`}>
              <span className="identity__avatar" aria-hidden="true">
                {identity.name.trim().charAt(0).toLocaleUpperCase('es-AR') || 'U'}
              </span>
              <span className="identity__copy">
                <strong>{identity.name}</strong>
                <small>{identity.role} · {identity.tenant}</small>
              </span>
            </div>
          ) : null}
          <button
            className="theme-toggle"
            type="button"
            onClick={onToggleTheme}
            aria-label={`Cambiar al tema ${nextTheme}`}
            title={`Usar tema ${nextTheme}`}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </div>
    </header>
  );
}
