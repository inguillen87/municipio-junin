import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import type { SessionIdentity } from '../auth/session';
import {
  getNavigationDefinition,
  projectNavigation,
  type NavigationItem,
  type ProjectedNavigationGroup,
} from '../navigation/catalog';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface GlobalNavigationProps {
  identity: SessionIdentity;
  onClose: () => void;
  trigger: HTMLButtonElement | null;
}

const GLOBAL_NAVIGATION_DIALOG_ID = 'muni-global-navigation-dialog';

function NavigationIcon({ name }: { name: string }) {
  const common = { 'aria-hidden': true, viewBox: '0 0 24 24', width: 20, height: 20 } as const;
  switch (name) {
    case 'home': return <svg {...common}><path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6" /></svg>;
    case 'chart': return <svg {...common}><path d="M4 20V10m6 10V4m6 16v-7m4 7H2" /></svg>;
    case 'people': return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V20M15 6.5a3 3 0 0 1 0 5.5m2 1a4.5 4.5 0 0 1 3.5 4.4V20" /></svg>;
    case 'map': return <svg {...common}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" /></svg>;
    case 'database': return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></svg>;
    case 'help': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 3.7 2c-.9.6-1.4 1.1-1.4 2.3M12 17.4h.01" /></svg>;
    case 'bank': return <svg {...common}><path d="m3 9 9-5 9 5M4 10h16M6 10v8m4-8v8m4-8v8m4-8v8M3 20h18" /></svg>;
    case 'organization': return <svg {...common}><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></svg>;
    case 'movement': return <svg {...common}><path d="M4 7h14m-4-4 4 4-4 4M20 17H6m4 4-4-4 4-4" /></svg>;
    case 'gauge': return <svg {...common}><path d="M4.2 18a9 9 0 1 1 15.6 0M12 12l4-4M7 17h10" /></svg>;
    case 'check': return <svg {...common}><path d="M5 12.5 9.5 17 19 7" /></svg>;
    case 'ai': return <svg {...common}><path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2m0-12-2 2M8 16l-2 2" /><circle cx="12" cy="12" r="4" /></svg>;
    case 'shield': return <svg {...common}><path d="M12 3 20 6v5c0 5.2-3.3 8.6-8 10-4.7-1.4-8-4.8-8-10V6l8-3Z" /></svg>;
    case 'upload': return <svg {...common}><path d="M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5" /></svg>;
    case 'export': return <svg {...common}><path d="M12 4h8v8M20 4 10 14M18 14v6H4V6h6" /></svg>;
    case 'eye': return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
    case 'doc': return <svg {...common}><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 13h6m-6 4h6" /></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

function NavigationLink({ item, active }: { item: NavigationItem; active: boolean }) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      className="global-navigation__link"
      data-nav-id={item.id}
      href={item.href}
    >
      <span className="global-navigation__item-icon"><NavigationIcon name={item.icon} /></span>
      <span>{item.label}</span>
      <svg className="global-navigation__arrow" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </a>
  );
}

function NavigationDisclosure({
  group,
  activeItemId,
  expanded,
  onToggle,
  panelId,
}: {
  group: ProjectedNavigationGroup;
  activeItemId: string | null;
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  return (
    <li className="global-navigation__group" data-group-id={group.id}>
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        className="global-navigation__group-toggle"
        type="button"
        onClick={onToggle}
      >
        <span className="global-navigation__group-icon"><NavigationIcon name={group.icon} /></span>
        <span>{group.label}</span>
        <span className="global-navigation__count" aria-label={`${group.items.length} opciones`}>{group.items.length}</span>
        <svg className="global-navigation__chevron" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="global-navigation__group-panel" hidden={!expanded} id={panelId}>
        <ul className="global-navigation__item-list">
          {group.items.map(item => (
            <li key={item.id}><NavigationLink item={item} active={item.id === activeItemId} /></li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function GlobalNavigation({ identity, onClose, trigger }: GlobalNavigationProps) {
  const titleId = useId();
  const panelPrefix = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const definition = getNavigationDefinition();
  const projection = definition ? projectNavigation(definition, identity.capabilities) : null;
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    projection?.activeGroupId ?? projection?.groups[0]?.id ?? null,
  );

  useLayoutEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const inertSelector = [
      '.app-shell',
      '.skip-link',
      '.topbar__inner',
      '#contenido-principal',
      '[data-muniguia-root]',
      '.muniguia-bridge',
      '.muni-guide-trigger',
      '.muni-guide-overlay',
      '.muni-guide-dialog',
    ].join(',');
    const inertStates = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
    const isolate = (element: HTMLElement) => {
      if (element.closest('.global-navigation') || inertStates.has(element)) return;
      inertStates.set(element, {
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      });
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    };
    document.querySelectorAll<HTMLElement>(inertSelector).forEach(isolate);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const addedNode of record.addedNodes) {
          if (!(addedNode instanceof HTMLElement)) continue;
          if (addedNode.matches(inertSelector)) isolate(addedNode);
          addedNode.querySelectorAll<HTMLElement>(inertSelector).forEach(isolate);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
      for (const [element, state] of inertStates) {
        element.inert = state.inert;
        if (state.ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', state.ariaHidden);
      }
      trigger?.focus();
    };
  }, [trigger]);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!projection?.activeGroupId) return;
    setExpandedGroupId(projection.activeGroupId);
  }, [projection?.activeGroupId]);

  const handleTrap = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])]
      .filter(element => !element.hidden && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      panelRef.current?.focus();
    } else if (document.activeElement === panelRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="global-navigation" data-state="open">
      <div
        aria-hidden="true"
        className="global-navigation__overlay"
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="global-navigation__panel"
        id={GLOBAL_NAVIGATION_DIALOG_ID}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        onKeyDown={handleTrap}
      >
        <header className="global-navigation__header">
          <div>
            <span>Municipalidad de Junín</span>
            <h2 id={titleId}>Menú principal</h2>
          </div>
          <button className="global-navigation__close" type="button" aria-label="Cerrar menú principal" onClick={onClose}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        {projection ? (
          <nav className="global-navigation__nav" aria-label="Secciones de MuniControl">
            <ul className="global-navigation__top global-navigation__item-list">
              {projection.top.map(item => (
                <li key={item.id}><NavigationLink item={item} active={item.id === projection.activeItemId} /></li>
              ))}
            </ul>
            <ul className="global-navigation__groups">
              {projection.groups.map(group => (
                <NavigationDisclosure
                  activeItemId={projection.activeItemId}
                  expanded={expandedGroupId === group.id}
                  group={group}
                  key={group.id}
                  onToggle={() => setExpandedGroupId(group.id)}
                  panelId={`${panelPrefix}-${group.id}`}
                />
              ))}
            </ul>
            <footer className="global-navigation__footer">
              <ul className="global-navigation__item-list">
              {projection.footer.map(item => (
                <li key={item.id}><NavigationLink item={item} active={item.id === projection.activeItemId} /></li>
              ))}
              </ul>
            </footer>
          </nav>
        ) : (
          <p className="global-navigation__unavailable" role="status">
            El menú institucional no está disponible. Volvé a Inicio para continuar.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

export { NavigationIcon };
export { GLOBAL_NAVIGATION_DIALOG_ID };
