const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const { waitForDatabase } = require('./config/db');

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Body parsing and security middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

// Ensure UTF-8 for JSON responses
app.use((req, res, next) => {
  res.charset = 'utf-8';
  next();
});

// Request logging middleware (logs method, path, status, duration; no secrets/passwords)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Healthcheck endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Serve frontend static assets
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/shifts', require('./routes/shiftRoutes'));
app.use('/api/employee-shifts', require('./routes/employeeShiftRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/employee', require('./routes/employeePortalRoutes'));

// Fallback for unknown API endpoints
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint không tồn tại: ${req.method} ${req.originalUrl}`
  });
});

// Specific route fallbacks
app.get('/employee', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'employee.html'));
});

// Single Page Application fallback for web navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi hệ thống máy chủ'
  });
});

// Start server after verifying DB connection
async function startServer() {
  try {
    console.log('[Server] Checking MySQL database readiness...');
    await waitForDatabase(25, 2000);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Attendance Management System running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Critical startup error:', error.message);
    process.exit(1);
  }
}

startServer();
