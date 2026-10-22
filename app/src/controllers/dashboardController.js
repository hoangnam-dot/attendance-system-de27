const { pool } = require('../config/db');

async function getStats(req, res) {
  try {
    // 1. Total employees
    const [[{ total_employees }]] = await pool.query(
      'SELECT COUNT(*) AS total_employees FROM employees'
    );

    // 2. Checked in today (distinct employees who checked in today)
    const [[{ checked_in_today }]] = await pool.query(
      'SELECT COUNT(DISTINCT employee_id) AS checked_in_today FROM attendance WHERE attendance_date = CURDATE()'
    );

    // 3. Not checked in today
    const not_checked_in = Math.max(0, total_employees - checked_in_today);

    // 4. Late check-ins today
    const [[{ late_today }]] = await pool.query(
      "SELECT COUNT(*) AS late_today FROM attendance WHERE attendance_date = CURDATE() AND status = 'LATE'"
    );

    // 5. Recent attendance records
    const [recentAttendance] = await pool.query(`
      SELECT 
        a.id,
        a.employee_id,
        a.shift_id,
        DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
        TIME_FORMAT(a.check_in, '%H:%i:%s') AS check_in,
        TIME_FORMAT(a.check_out, '%H:%i:%s') AS check_out,
        a.status,
        e.employee_code,
        e.full_name,
        e.department,
        s.shift_name,
        TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(s.end_time, '%H:%i') AS end_time
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      ORDER BY a.attendance_date DESC, a.check_in DESC
      LIMIT 10
    `);

    return res.json({
      success: true,
      data: {
        stats: {
          total_employees: parseInt(total_employees, 10),
          checked_in_today: parseInt(checked_in_today, 10),
          not_checked_in: parseInt(not_checked_in, 10),
          late_today: parseInt(late_today, 10)
        },
        recent_attendance: recentAttendance
      }
    });
  } catch (err) {
    console.error('getStats error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải dữ liệu thống kê: ' + err.message
    });
  }
}

module.exports = {
  getStats
};
