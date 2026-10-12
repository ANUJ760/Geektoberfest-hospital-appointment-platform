/**
 * Converts headers and row data into a formatted CSV string.
 *
 * @param {Array<{ label: string, key: string | Function }>} headers
 * @param {Array<object>} rows
 * @returns {string}
 */
export const generateCSV = (headers, rows) => {
  if (!headers || !headers.length) return '';
  const headerLine = headers
    .map((h) => `"${String(h.label ?? '').replace(/"/g, '""')}"`)
    .join(',');

  const rowLines = (rows || []).map((row) =>
    headers
      .map((h) => {
        const val = typeof h.key === 'function' ? h.key(row) : row?.[h.key];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  return [headerLine, ...rowLines].join('\r\n');
};

/**
 * Initiates a browser download of CSV content as a file.
 *
 * @param {string} filename
 * @param {string} csvContent
 */
export const downloadCSV = (filename, csvContent) => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
