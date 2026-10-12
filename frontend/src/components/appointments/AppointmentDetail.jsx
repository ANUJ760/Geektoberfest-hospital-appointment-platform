import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as appointmentApi from '../../api/appointmentApi';
import useFetch from '../../hooks/useFetch';
import { doctorName, formatDate, formatTime, getErrorMessage } from '../../utils/format';
import Alert from '../common/Alert';
import Modal from '../common/Modal';
import PageHeader from '../common/PageHeader';
import Spinner from '../common/Spinner';
import StatusBadge from '../common/StatusBadge';

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-1 border-b border-slate-100 py-3 sm:flex-row sm:justify-between">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-sm font-medium text-slate-800">{children}</dd>
  </div>
);

/** Shared appointment details page for patient and doctor. */
export default function AppointmentDetail({ role }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: appt, loading, error, reload } = useFetch(() => appointmentApi.getAppointment(id), [id]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState(null);
  const [prescription, setPrescription] = useState('');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  if (loading && !appt) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (!appt) return null;

  const run = async (fn, successText) => {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      await fn();
      setMessage({ type: 'success', text: successText });
      await reload();
    } catch (err) {
      setMessage({ type: 'error', text: getErrorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  };

  const cancel = () => {
    if (!window.confirm('Cancel this appointment?')) return;
    run(() => appointmentApi.cancelAppointment(appt._id), 'Appointment cancelled');
  };
  const setStatus = (status, completionPrescription = prescription) =>
    run(
      () => appointmentApi.updateAppointmentStatus(appt._id, {
        status,
        reason,
        notes: notes ?? appt.notes,
        ...(status === 'completed' && { prescription: completionPrescription }),
      }),
      `Appointment marked ${status}`
    );

  const openCompletionModal = () => {
    setReason(appt.reason || '');
    setNotes(appt.notes || '');
    setPrescription(appt.prescription || '');
    setShowCompletionModal(true);
  };

  const completeAppointment = async (event) => {
    event.preventDefault();
    if (await setStatus('completed', prescription)) setShowCompletionModal(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Appointment details"
        actions={<button type="button" className="btn-secondary" onClick={() => navigate(`/${role}/appointments`)}>Back</button>}
      />
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{formatDate(appt.date)}</h2>
          <StatusBadge status={appt.status} />
        </div>
        <dl>
          <Row label="Time">{formatTime(appt.startTime)} - {formatTime(appt.endTime)}</Row>
          <Row label="Doctor">{doctorName(appt.doctor)} ({appt.doctor?.specialization})</Row>
          <Row label="Department">{appt.department?.name || appt.doctor?.department?.name || '-'}</Row>
          <Row label="Patient">{appt.patient?.name} · {appt.patient?.email}</Row>
          <Row label="Reason">{appt.reason || '-'}</Row>
          <Row label="Doctor notes">{appt.notes || '-'}</Row>
          <Row label="Prescription">{appt.prescription || '-'}</Row>
          {appt.status === 'cancelled' && <Row label="Cancelled by">{appt.cancelledBy || '-'}</Row>}
        </dl>

        <div className="mt-4 space-y-3">
          <Alert type={message.type || 'info'}>{message.text}</Alert>
          {appt.status === 'booked' && (
            <div className="flex flex-wrap gap-2">
              {role === 'doctor' && (
                <button type="button" id="mark-completed" className="btn-primary" disabled={busy} onClick={openCompletionModal}>Mark completed</button>
              )}
              <button type="button" id="cancel-appointment" className="btn-danger" disabled={busy} onClick={cancel}>Cancel appointment</button>
            </div>
          )}
          {role === 'patient' && appt.status !== 'booked' && (
            <Link to={`/patient/doctors/${appt.doctor?._id}`} className="btn-secondary">Book again</Link>
          )}
        </div>
      </div>
      {showCompletionModal && (
        <Modal title="Complete appointment" onClose={() => setShowCompletionModal(false)}>
          <form onSubmit={completeAppointment} className="space-y-3" noValidate>
            <p className="text-sm text-slate-600">Add the diagnosis notes and prescription before completing this appointment.</p>
            <div>
              <label htmlFor="completion-reason" className="label">Reason for visit</label>
              <textarea
                id="completion-reason"
                rows={3}
                maxLength={500}
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="completion-notes" className="label">Diagnosis notes</label>
              <textarea
                id="completion-notes"
                rows={4}
                maxLength={1000}
                className="input"
                value={notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="prescription" className="label">Prescription</label>
              <textarea
                id="prescription"
                rows={4}
                maxLength={2000}
                className="input"
                value={prescription}
                onChange={(e) => setPrescription(e.target.value)}
                placeholder="Enter medicines and instructions"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowCompletionModal(false)}>Cancel</button>
              <button type="submit" id="confirm-completion" className="btn-primary" disabled={busy}>
                {busy ? 'Completing...' : 'Complete appointment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
