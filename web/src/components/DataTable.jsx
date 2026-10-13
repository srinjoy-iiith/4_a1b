// A table + pagination used by every list screen.
// columns: [{ key, label, render?: row => node, className? }]
import { Button } from './ui.jsx';

export function DataTable({ columns, rows, onRowClick, rowKey = r => r.id, rowClass }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c.key} className={c.className}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)} className={`${onRowClick ? 'clickable' : ''} ${rowClass ? rowClass(row) : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map(c => <td key={c.key} className={c.className}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// result = the { page, totalPages, total } object the API returns for paged lists
export function Pagination({ result, onPage, loading }) {
  if (!result) return null;
  const { page, totalPages, total } = result;
  return (
    <div className="pagination">
      <span>{total.toLocaleString('en-IN')} records · page {page} of {totalPages.toLocaleString('en-IN')}</span>
      <div className="row">
        <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>← Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => onPage(page + 1)}>Next →</Button>
      </div>
    </div>
  );
}
