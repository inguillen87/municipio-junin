export interface RiskItemData {
  level: 'guarded' | 'high' | 'medium';
  mark: string;
  title: string;
  detail: string;
}

interface RiskListProps {
  items: readonly RiskItemData[];
}

export function RiskList({ items }: RiskListProps) {
  return (
    <ul className="risk-list">
      {items.map((item, index) => (
        <li className="risk-item" data-level={item.level} key={`${item.title}-${index}`}>
          <span className="risk-item__mark" aria-hidden="true">{item.mark}</span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
