import { SAFE_WORKSPACE } from '../auth/session';

interface LoadingProps {
  description: string;
  title?: string;
}

interface BlockedProps {
  description: string;
  onRetry: () => void;
  title?: string;
}

export function GovernedLoading({
  description,
  title = 'Comprobando datos y permisos',
}: LoadingProps) {
  return (
    <section className="loading-state" role="status" aria-live="polite" aria-label="Comprobando datos y permisos">
      <div className="state-card">
        <div className="loader" aria-hidden="true" />
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}

export function GovernedBlocked({
  description,
  onRetry,
  title = 'No pudimos mostrar los datos',
}: BlockedProps) {
  return (
    <section className="blocked-state" role="alert" aria-live="assertive">
      <div className="state-card">
        <div className="state-card__icon" aria-hidden="true">!</div>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="state-card__actions">
          <button className="button button--primary" type="button" onClick={onRetry}>Volver a intentar</button>
          <a className="button" href={SAFE_WORKSPACE}>Volver al inicio</a>
        </div>
      </div>
    </section>
  );
}
