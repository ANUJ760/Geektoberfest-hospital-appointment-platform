import { useEffect, useState } from 'react';
import * as adminApi from '../../api/adminApi';
import DataTable from '../../components/admin/DataTable';
import Alert from '../../components/common/Alert';
import PageHeader from '../../components/common/PageHeader';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import useFetch from '../../hooks/useFetch';
import { generateCSV, downloadCSV } from '../../utils/csv';
import { getErrorMessage, todayString } from '../../utils/format';

export default function Patients() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, loading, error, reload } = useFetch(() => adminApi.listPatients(debounced ? { search: debounced } : {}), [debounced]);

  const toggle = async (p) => {
    if (p.isActive && !window.confirm(`Deactivate ${p.name}?`)) return;
    try {
      await adminApi.updateUser(p._id, { isActive: !p.isActive });
      setMessage({ type: 'success', text: `Patient ${p.isActive ? 'deactivated' : 'activated'}` });
      reload();
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const handleExportCSV = () => {
    if (!data || !data.length) return;
    const headers = [
      { label: 'Patient ID', key: '_id' },
      { label: 'Name', key: 'name' },
      { label: 'Email', key: 'email' },
      { label: 'Phone', key: (p) => p.phone || '' },
      { label: 'Status', key: (p) => (p.isActive ? 'Active' : 'Inactive') },
      { label: 'Role', key: 'role' },
      { label: 'Joined', key: (p) => (p.createdAt ? new Date(p.createdAt).toISOString() : '') },
    ];
    const csv = generateCSV(headers, data);
    downloadCSV(`patients_${todayString()}.csv`, csv);
  };

  const columns = [
    { header: 'Name', render: (p) => <span className="font-medium">{p.name}</span> },
    { header: 'Email', render: (p) => p.email },
    { header: 'Phone', render: (p) => p.phone || '-' },
    { header: 'Joined', render: (p) => new Date(p.createdAt).toLocaleDateString() },
    { header: 'Status', render: (p) => <StatusBadge status={p.isActive ? 'active' : 'inactive'} /> },
    { header: 'Actions', render: (p) => <button type="button" className={`${p.isActive ? 'btn-danger' : 'btn-primary'} btn-sm`} onClick={() => toggle(p)}>{p.isActive ? 'Deactivate' : 'Activate'}</button> },
  ];

  return (
    <div>
      <PageHeader
        title="Patients"
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCSV}
            disabled={!data || data.length === 0}
            id="export-patients-csv"
          >
            Export to CSV
          </button>
        }
      />
      <div className="mb-4 max-w-sm">
        <label htmlFor="patient-search" className="label">Search</label>
        <input id="patient-search" className="input" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mb-4 space-y-2">
        <Alert type={message.type || 'info'}>{message.text}</Alert>
        <Alert>{error}</Alert>
      </div>
      {loading ? <Spinner /> : <DataTable columns={columns} rows={data || []} emptyTitle="No patients found" />}
    </div>
  );
}
