export interface ActionItemData {
  index: string;
  title: string;
  detail: string;
}

interface ActionQueueProps {
  items: readonly ActionItemData[];
}

export function ActionQueue({ items }: ActionQueueProps) {
  return (
    <ol className="action-queue">
      {items.map(item => (
        <li className="action-item" key={`${item.index}-${item.title}`}>
          <span className="action-item__index" aria-hidden="true">{item.index}</span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
