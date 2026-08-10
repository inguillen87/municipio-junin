import type { ReactNode } from 'react';

export interface TableColumn<Row> {
  key: string;
  label: string;
  align?: 'start' | 'end';
  render: (row: Row) => ReactNode;
}

interface ResponsiveTableProps<Row> {
  label: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}

export function ResponsiveTable<Row>({ label, columns, rows, rowKey }: ResponsiveTableProps<Row>) {
  return (
    <div className="table-region" role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} scope="col" data-align={column.align ?? 'start'}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map((column, columnIndex) => {
                const content = column.render(row);
                return columnIndex === 0 ? (
                  <th key={column.key} scope="row" data-align={column.align ?? 'start'}>{content}</th>
                ) : (
                  <td key={column.key} data-align={column.align ?? 'start'}>{content}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
