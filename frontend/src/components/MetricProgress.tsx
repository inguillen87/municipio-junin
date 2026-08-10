interface MetricProgressProps {
  label: string;
  value: number;
  valueLabel: string;
  detail?: string;
  tone?: 'positive' | 'warning' | 'critical';
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function MetricProgress({
  label,
  value,
  valueLabel,
  detail,
  tone = 'positive',
}: MetricProgressProps) {
  const normalizedValue = clampPercentage(value);

  return (
    <div className="metric-progress" data-tone={tone}>
      <div className="metric-progress__heading">
        <span>{label}</span>
        <strong>{valueLabel}</strong>
      </div>
      <div
        className="metric-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedValue}
        aria-valuetext={valueLabel}
      >
        <span className="metric-progress__fill" style={{ width: `${normalizedValue}%` }} />
      </div>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
