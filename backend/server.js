require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { authRateLimiter } = require('./middlewares/rateLimiter');

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/health', require('./routes/healthRoutes'));
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));
app.use('/api/patients', require('./routes/patientRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/availability', require('./routes/availabilityRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/waiting-list', require('./routes/waitingListRoutes'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not defined. Check your .env file.');
    await connectDB();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();

module.exports = app;
