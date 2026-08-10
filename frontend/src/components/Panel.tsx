import type { ReactNode } from 'react';

interface PanelProps {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ id, eyebrow, title, description, badge, children, className = '' }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()} aria-labelledby={id}>
      <header className="panel__header">
        <div>
          {eyebrow ? <p className="panel__eyebrow">{eyebrow}</p> : null}
          <h2 id={id}>{title}</h2>
          {description ? <p className="panel__description">{description}</p> : null}
        </div>
        {badge ? <span className="panel__badge">{badge}</span> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
