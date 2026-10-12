import { useState } from 'react';
import * as appointmentApi from '../../api/appointmentApi';
import AppointmentList from '../../components/appointments/AppointmentList';
import Alert from '../../components/common/Alert';
import PageHeader from '../../components/common/PageHeader';
import Spinner from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import { generateCSV, downloadCSV } from '../../utils/csv';
import { getErrorMessage, todayString } from '../../utils/format';

export default function Appointments() {
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const params = { ...(status && { status }), ...(date && { date }) };
  const { data, loading, error, reload } = useFetch(() => appointmentApi.listAllAppointments(params), [status, date]);

  const cancel = async (a) => {
    if (!window.confirm('Cancel this appointment?')) return;
    try {
      await appointmentApi.cancelAppointment(a._id);
      setMessage({ type: 'success', text: 'Appointment cancelled' });
      reload();
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const handleExportCSV = () => {
    if (!data || !data.length) return;
    const headers = [
      { label: 'Appointment ID', key: '_id' },
      { label: 'Date', key: 'date' },
      { label: 'Start Time', key: 'startTime' },
      { label: 'End Time', key: 'endTime' },
      { label: 'Status', key: 'status' },
      { label: 'Doctor Name', key: (a) => a.doctor?.user?.name || '' },
      { label: 'Specialization', key: (a) => a.doctor?.specialization || '' },
      { label: 'Department', key: (a) => a.doctor?.department?.name || '' },
      { label: 'Patient Name', key: (a) => a.patient?.name || '' },
      { label: 'Patient Email', key: (a) => a.patient?.email || '' },
      { label: 'Patient Phone', key: (a) => a.patient?.phone || '' },
      { label: 'Reason', key: (a) => a.reason || '' },
      { label: 'Consultation Notes', key: (a) => a.consultationNotes || '' },
      { label: 'Prescription', key: (a) => a.prescription || '' },
      { label: 'Created At', key: (a) => (a.createdAt ? new Date(a.createdAt).toISOString() : '') },
    ];
    const csv = generateCSV(headers, data);
    const dateStamp = date || todayString();
    downloadCSV(`appointments_${dateStamp}.csv`, csv);
  };

  return (
    <div>
      <PageHeader
        title="All appointments"
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCSV}
            disabled={!data || data.length === 0}
            id="export-appointments-csv"
          >
            Export to CSV
          </button>
        }
      />
      <div className="card mb-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="a-status" className="label">Status</label>
          <select id="a-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="a-filter-date" className="label">Date</label>
          <input id="a-filter-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end"><button type="button" className="btn-secondary" onClick={() => { setStatus(''); setDate(''); }}>Clear filters</button></div>
      </div>
      <div className="mb-4 space-y-2">
        <Alert type={message.type || 'info'}>{message.text}</Alert>
        <Alert>{error}</Alert>
      </div>
      {loading ? <Spinner /> : (
        <AppointmentList
          appointments={data || []}
          role="admin"
          renderActions={(a) => a.status === 'booked' && <button type="button" className="btn-danger btn-sm" onClick={() => cancel(a)}>Cancel</button>}
        />
      )}
    </div>
  );
}
