import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as appointmentApi from '../../api/appointmentApi';
import * as doctorApi from '../../api/doctorApi';
import AppointmentList from '../../components/appointments/AppointmentList';
import Alert from '../../components/common/Alert';
import PageHeader from '../../components/common/PageHeader';
import Spinner from '../../components/common/Spinner';
import useFetch from '../../hooks/useFetch';
import { getErrorMessage } from '../../utils/format';

export default function Appointments() {
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const params = { ...(status && { status }), ...(date && { date }) };
  const { data, loading, error, reload } = useFetch(() => doctorApi.getMyDoctorAppointments(params), [status, date]);

  const update = async (a, newStatus) => {
    if (newStatus === 'cancelled' && !window.confirm('Cancel this appointment?')) return;
    try {
      await appointmentApi.updateAppointmentStatus(a._id, { status: newStatus });
      setMessage({ type: 'success', text: `Appointment ${newStatus}` });
      reload();
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
    }
  };

  return (
    <div>
      <PageHeader title="Appointments" />
      <div className="card mb-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="f-status" className="label">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-date" className="label">Date</label>
          <input id="f-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button type="button" className="btn-secondary" onClick={() => { setStatus(''); setDate(''); }}>Clear filters</button>
        </div>
      </div>
      <div className="mb-4 space-y-2">
        <Alert type={message.type || 'info'}>{message.text}</Alert>
        <Alert>{error}</Alert>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <AppointmentList
          appointments={data || []}
          role="doctor"
          renderActions={(a) =>
            a.status === 'booked' && (
              <>
                <Link className="btn-primary btn-sm" to={`/doctor/appointments/${a._id}`}>Complete</Link>
                <button type="button" className="btn-danger btn-sm" onClick={() => update(a, 'cancelled')}>Cancel</button>
              </>
            )
          }
        />
      )}
    </div>
  );
}
