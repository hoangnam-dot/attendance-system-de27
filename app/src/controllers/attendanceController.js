const { pool } = require('../config/db');

// Helper to get formatted current date and time (Vietnam UTC+7)
function getLocalDateTime() {
  const now = new Date();
  // Adjust to UTC+7
  const vnOffset = 7 * 60;
  const localTime = new Date(now.getTime() + (vnOffset + now.getTimezoneOffset()) * 60000);
  
  const yyyy = localTime.getFullYear();
  const mm = String(localTime.getMonth() + 1).padStart(2, '0');
  const dd = String(localTime.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const hh = String(localTime.getHours()).padStart(2, '0');
  const min = String(localTime.getMinutes()).padStart(2, '0');
  const ss = String(localTime.getSeconds()).padStart(2, '0');
  const timeStr = `${hh}:${min}:${ss}`;

  return { dateStr, timeStr };
}

async function getAll(req, res) {
  try {
    const { date, employee_id, status, search } = req.query;

    let query = `
      SELECT 
        a.id,
        a.employee_id,
        a.shift_id,
        DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
        TIME_FORMAT(a.check_in, '%H:%i:%s') AS check_in,
        TIME_FORMAT(a.check_out, '%H:%i:%s') AS check_out,
        a.status,
        a.created_at,
        e.employee_code,
        e.full_name,
        e.department,
        e.email,
        s.shift_name,
        TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(s.end_time, '%H:%i') AS end_time
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (date && date.trim() !== '') {
      query += ' AND a.attendance_date = ?';
      params.push(date.trim());
    }

    if (employee_id && employee_id.trim() !== '') {
      query += ' AND a.employee_id = ?';
      params.push(parseInt(employee_id, 10));
    }

    if (status && (status === 'ON_TIME' || status === 'LATE')) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (search && search.trim() !== '') {
      const term = `%${search.trim()}%`;
      query += ' AND (e.employee_code LIKE ? OR e.full_name LIKE ? OR e.department LIKE ?)';
      params.push(term, term, term);
    }

    query += ' ORDER BY a.attendance_date DESC, a.check_in DESC';

    const [rows] = await pool.execute(query, params);
    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error('getAttendance error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải lịch sử điểm danh: ' + err.message
    });
  }
}

async function checkIn(req, res) {
  try {
    const { employee_id, shift_id, check_in_time, attendance_date } = req.body;

    if (!employee_id || !shift_id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn nhân viên và ca làm việc'
      });
    }

    const { dateStr, timeStr } = getLocalDateTime();
    const targetDate = attendance_date || dateStr;
    const finalCheckInTime = check_in_time ? (check_in_time.length === 5 ? `${check_in_time}:00` : check_in_time) : timeStr;

    // 1. Get shift info to compare start_time
    const [shifts] = await pool.execute(
      'SELECT id, shift_name, TIME_FORMAT(start_time, "%H:%i:%s") AS start_time FROM shifts WHERE id = ?',
      [shift_id]
    );

    if (shifts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ca làm việc đã chọn'
      });
    }

    const shift = shifts[0];

    // 2. Check if employee exists
    const [employees] = await pool.execute(
      'SELECT id, employee_code, full_name FROM employees WHERE id = ?',
      [employee_id]
    );

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân viên đã chọn'
      });
    }

    const employee = employees[0];

    // 3. Check duplicate attendance for employee + shift + date
    const [existing] = await pool.execute(
      'SELECT id FROM attendance WHERE employee_id = ? AND shift_id = ? AND attendance_date = ?',
      [employee_id, shift_id, targetDate]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Nhân viên "${employee.full_name}" (${employee.employee_code}) đã được điểm danh trong ca này vào ngày ${targetDate}!`
      });
    }

    // 4. Compare check_in_time with shift start_time
    // Status is 'LATE' if check_in_time > shift.start_time, else 'ON_TIME'
    const status = finalCheckInTime > shift.start_time ? 'LATE' : 'ON_TIME';

    // 5. Insert attendance record
    const [result] = await pool.execute(
      'INSERT INTO attendance (employee_id, shift_id, attendance_date, check_in, status) VALUES (?, ?, ?, ?, ?)',
      [employee_id, shift_id, targetDate, finalCheckInTime, status]
    );

    return res.status(201).json({
      success: true,
      message: `Điểm danh thành công! Trạng thái: ${status === 'LATE' ? 'ĐI MUỘN (LATE)' : 'ĐÚNG GIỜ (ON_TIME)'}`,
      data: {
        id: result.insertId,
        employee_id,
        employee_code: employee.employee_code,
        full_name: employee.full_name,
        shift_id,
        shift_name: shift.shift_name,
        attendance_date: targetDate,
        check_in: finalCheckInTime,
        status
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Nhân viên đã điểm danh ca này trong ngày hôm nay rồi!'
      });
    }
    console.error('checkIn error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi điểm danh: ' + err.message
    });
  }
}

async function checkOut(req, res) {
  try {
    const { attendance_id, check_out_time } = req.body;

    if (!attendance_id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp mã bản ghi điểm danh cần check-out'
      });
    }

    const { timeStr } = getLocalDateTime();
    const finalCheckOutTime = check_out_time ? (check_out_time.length === 5 ? `${check_out_time}:00` : check_out_time) : timeStr;

    // Check attendance record exists
    const [records] = await pool.execute(`
      SELECT 
        a.id, 
        a.attendance_date, 
        a.check_in, 
        a.check_out, 
        e.full_name, 
        e.employee_code, 
        s.shift_name 
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      WHERE a.id = ?
    `, [attendance_id]);

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy bản ghi điểm danh'
      });
    }

    const record = records[0];

    const [result] = await pool.execute(
      'UPDATE attendance SET check_out = ? WHERE id = ?',
      [finalCheckOutTime, attendance_id]
    );

    return res.json({
      success: true,
      message: `Check-out thành công cho nhân viên ${record.full_name} (${record.employee_code}) lúc ${finalCheckOutTime}`,
      data: {
        id: attendance_id,
        check_out: finalCheckOutTime
      }
    });
  } catch (err) {
    console.error('checkOut error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi check-out: ' + err.message
    });
  }
}

async function getTodayActive(req, res) {
  try {
    // Get all attendances today that do not have check_out yet or all attendances today
    const [rows] = await pool.query(`
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
        s.shift_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      JOIN shifts s ON a.shift_id = s.id
      WHERE a.attendance_date = CURDATE()
      ORDER BY a.check_in DESC
    `);

    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error('getTodayActive error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải danh sách điểm danh hôm nay: ' + err.message
    });
  }
}

module.exports = {
  getAll,
  checkIn,
  checkOut,
  getTodayActive
};
