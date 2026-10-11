const Appointment = require('../models/Appointment');
const { asyncHandler } = require('../middlewares/errorHandler');

/**
 * GET /api/admin/analytics
 * Returns hospital utilization, peak booking hours, and 6-month revenue trends.
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  const startMonth = months[0];

  const [utilization, peakHours, rawRevenue] = await Promise.all([
    // 1. Department utilization
    Appointment.aggregate([
      {
        $group: {
          _id: '$department',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: 'departments',
          localField: '_id',
          foreignField: '_id',
          as: 'dept',
        },
      },
      {
        $project: {
          _id: 0,
          name: { $ifNull: [{ $arrayElemAt: ['$dept.name', 0] }, 'Unassigned'] },
          total: 1,
          completed: 1,
          cancelled: 1,
          rate: {
            $cond: [
              { $gt: ['$total', 0] },
              { $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 1] },
              0,
            ],
          },
        },
      },
      { $sort: { total: -1 } },
    ]),

    // 2. Peak booking hours (excluding cancelled appointments)
    Appointment.aggregate([
      {
        $match: {
          status: { $ne: 'cancelled' },
        },
      },
      {
        $project: {
          hour: { $toInt: { $substrCP: ['$startTime', 0, 2] } },
        },
      },
      {
        $group: {
          _id: '$hour',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          hour: '$_id',
          count: 1,
        },
      },
      { $sort: { hour: 1 } },
    ]),

    // 3. Revenue trends: completed appointments in the last 6 months
    Appointment.aggregate([
      {
        $match: {
          status: 'completed',
          date: { $gte: `${startMonth}-01` },
        },
      },
      {
        $lookup: {
          from: 'doctors',
          localField: 'doctor',
          foreignField: '_id',
          as: 'doctorDoc',
        },
      },
      {
        $unwind: '$doctorDoc',
      },
      {
        $group: {
          _id: { $substrCP: ['$date', 0, 7] },
          revenue: { $sum: { $ifNull: ['$doctorDoc.consultationFee', 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          month: '$_id',
          revenue: 1,
        },
      },
      { $sort: { month: 1 } },
    ]),
  ]);

  const revenueMap = Object.fromEntries(rawRevenue.map((r) => [r.month, r.revenue]));
  const revenue = months.map((month) => ({ month, revenue: revenueMap[month] || 0 }));

  res.status(200).json({
    success: true,
    message: 'Analytics retrieved',
    data: {
      utilization,
      peakHours,
      revenue,
    },
  });
});

module.exports = { getAnalytics };
