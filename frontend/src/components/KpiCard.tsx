export interface KpiCardData {
  label: string;
  value: string;
  note: string;
  title?: string | undefined;
  tone: 'green' | 'amber' | 'red' | 'cyan' | 'violet' | 'neutral';
}

export function KpiCard({ label, value, note, title, tone }: KpiCardData) {
  return (
    <article className="kpi-card" data-tone={tone} title={title}>
      <span className="kpi-card__label">{label}</span>
      <strong className="kpi-card__value">{value}</strong>
      <p>{note}</p>
    </article>
  );
}
