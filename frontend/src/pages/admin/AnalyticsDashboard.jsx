import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAnalytics } from '../../api/adminApi';
import Alert from '../../components/common/Alert';
import PageHeader from '../../components/common/PageHeader';
import Spinner from '../../components/common/Spinner';

export default function AnalyticsDashboard() {
  const [data, setData] = useState({ utilization: [], peakHours: [], revenue: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await getAnalytics();
      const payload = res?.data || res;
      setData({
        utilization: payload?.utilization || [],
        peakHours: payload?.peakHours || [],
        revenue: payload?.revenue || [],
      });
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load analytics');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => {
      fetchData(false);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <Spinner label="Loading analytics..." />;
  if (error) return <Alert>{error}</Alert>;

  const formatHour = (hour) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <div>
      <PageHeader
        title="Administrative analytics"
        subtitle="Real-time hospital utilization, peak booking hours, and revenue trends"
      />

      <div className="grid gap-6">
        {/* Department Utilization */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Hospital Department Utilization</h2>
            <p className="text-xs text-slate-500">Appointment volume, completed consultations, and cancellations</p>
          </div>
          {data.utilization.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No utilization data available</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.utilization} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', borderColor: '#cbd5e1' }}
                    formatter={(value, name) => [value, name === 'completed' ? 'Completed' : name === 'cancelled' ? 'Cancelled' : 'Total']}
                  />
                  <Legend />
                  <Bar dataKey="completed" fill="#0d9488" name="Completed" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cancelled" fill="#ef4444" name="Cancelled" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="total" fill="#94a3b8" name="Total Booked" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Peak Booking Hours */}
          <div className="card">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Peak Booking Hours</h2>
              <p className="text-xs text-slate-500">Active appointment distribution by scheduled hour</p>
            </div>
            {data.peakHours.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">No booking hours data available</p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.peakHours} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <defs>
                      <linearGradient id="hourGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={formatHour}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', borderColor: '#cbd5e1' }}
                      labelFormatter={formatHour}
                      formatter={(value) => [value, 'Appointments']}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#0d9488"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#hourGradient)"
                      name="Appointments"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Revenue Trends */}
          <div className="card">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Revenue Trends</h2>
              <p className="text-xs text-slate-500">Monthly consultation fee revenue (last 6 months)</p>
            </div>
            {data.revenue.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">No revenue data available</p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.revenue} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', borderColor: '#cbd5e1' }}
                      formatter={(value) => [`$${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#0d9488"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#0d9488' }}
                      activeDot={{ r: 6 }}
                      name="Revenue"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
