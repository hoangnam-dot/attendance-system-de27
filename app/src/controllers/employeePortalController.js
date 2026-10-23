const { pool } = require('../config/db');

// Helper to get formatted local date & time (UTC+7)
function getLocalDateTime() {
  const now = new Date();
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

async function getProfile(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Tài khoản chưa được liên kết với nhân viên nào'
      });
    }

    const [rows] = await pool.execute(
      'SELECT id, employee_code, full_name, email, department, DATE_FORMAT(created_at, "%Y-%m-%d") AS created_at FROM employees WHERE id = ?',
      [employeeId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin nhân viên'
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ: ' + err.message
    });
  }
}

async function getTodayShift(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Tài khoản chưa liên kết với nhân viên'
      });
    }

    const { dateStr } = getLocalDateTime();

    const [rows] = await pool.execute(`
      SELECT 
        es.id AS assignment_id,
        DATE_FORMAT(es.work_date, '%Y-%m-%d') AS work_date,
        s.id AS shift_id,
        s.shift_name,
        TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
        TIME_FORMAT(s.start_time, '%H:%i:%s') AS raw_start_time
      FROM employee_shifts es
      JOIN shifts s ON es.shift_id = s.id
      WHERE es.employee_id = ? AND es.work_date = ?
      LIMIT 1
    `, [employeeId, dateStr]);

    return res.json({
      success: true,
      data: rows.length > 0 ? rows[0] : null
    });
  } catch (err) {
    console.error('getTodayShift error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải ca làm hôm nay: ' + err.message
    });
  }
}

async function getTodayAttendance(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Tài khoản chưa liên kết với nhân viên'
      });
    }

    const { dateStr } = getLocalDateTime();

    const [rows] = await pool.execute(`
      SELECT 
        a.id,
        a.shift_id,
        DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
        TIME_FORMAT(a.check_in, '%H:%i:%s') AS check_in,
        TIME_FORMAT(a.check_out, '%H:%i:%s') AS check_out,
        a.status,
        s.shift_name,
        TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(s.end_time, '%H:%i') AS end_time
      FROM attendance a
      JOIN shifts s ON a.shift_id = s.id
      WHERE a.employee_id = ? AND a.attendance_date = ?
      ORDER BY a.id DESC
      LIMIT 1
    `, [employeeId, dateStr]);

    return res.json({
      success: true,
      data: rows.length > 0 ? rows[0] : null
    });
  } catch (err) {
    console.error('getTodayAttendance error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải điểm danh hôm nay: ' + err.message
    });
  }
}

async function selfCheckIn(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Tài khoản chưa liên kết với nhân viên'
      });
    }

    const { dateStr, timeStr } = getLocalDateTime();
    const { check_in_time } = req.body;
    const finalCheckInTime = check_in_time ? (check_in_time.length === 5 ? `${check_in_time}:00` : check_in_time) : timeStr;

    // 1. Must have an assigned shift for today
    const [shifts] = await pool.execute(`
      SELECT 
        es.shift_id,
        s.shift_name,
        TIME_FORMAT(s.start_time, '%H:%i:%s') AS start_time
      FROM employee_shifts es
      JOIN shifts s ON es.shift_id = s.id
      WHERE es.employee_id = ? AND es.work_date = ?
      LIMIT 1
    `, [employeeId, dateStr]);

    if (shifts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Bạn chưa được phân ca làm việc trong ngày hôm nay! Vui lòng liên hệ Quản trị viên.'
      });
    }

    const shift = shifts[0];

    // 2. Check duplicate attendance
    const [existing] = await pool.execute(
      'SELECT id FROM attendance WHERE employee_id = ? AND shift_id = ? AND attendance_date = ?',
      [employeeId, shift.shift_id, dateStr]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Bạn đã thực hiện check-in cho ca làm việc hôm nay rồi!'
      });
    }

    // 3. Status determination: LATE if check_in_time > shift.start_time
    const status = finalCheckInTime > shift.start_time ? 'LATE' : 'ON_TIME';

    // 4. Insert attendance
    const [result] = await pool.execute(
      'INSERT INTO attendance (employee_id, shift_id, attendance_date, check_in, status) VALUES (?, ?, ?, ?, ?)',
      [employeeId, shift.shift_id, dateStr, finalCheckInTime, status]
    );

    console.log(`[ATTENDANCE] Check-in success: employee_id=${employeeId}, shift_id=${shift.shift_id}, status=${status}, time=${finalCheckInTime}`);

    return res.status(201).json({
      success: true,
      message: `Check-in thành công lúc ${finalCheckInTime}! Trạng thái: ${status === 'LATE' ? 'ĐI MUỘN (LATE)' : 'ĐÚNG GIỜ (ON_TIME)'}`,
      data: {
        id: result.insertId,
        shift_name: shift.shift_name,
        attendance_date: dateStr,
        check_in: finalCheckInTime,
        status
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Bạn đã check-in cho ca này hôm nay rồi!'
      });
    }
    console.error('selfCheckIn error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi check-in: ' + err.message
    });
  }
}

async function selfCheckOut(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Tài khoản chưa liên kết với nhân viên'
      });
    }

    const { dateStr, timeStr } = getLocalDateTime();
    const { check_out_time } = req.body;
    const finalCheckOutTime = check_out_time ? (check_out_time.length === 5 ? `${check_out_time}:00` : check_out_time) : timeStr;

    // Check attendance record today
    const [rows] = await pool.execute(
      'SELECT id, check_in, check_out FROM attendance WHERE employee_id = ? AND attendance_date = ? LIMIT 1',
      [employeeId, dateStr]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Bạn chưa thực hiện check-in hôm nay nên chưa thể check-out!'
      });
    }

    const record = rows[0];
    if (record.check_out) {
      return res.status(400).json({
        success: false,
        message: `Bạn đã check-out hôm nay rồi (lúc ${record.check_out})!`
      });
    }

    await pool.execute(
      'UPDATE attendance SET check_out = ? WHERE id = ?',
      [finalCheckOutTime, record.id]
    );

    console.log(`[ATTENDANCE] Check-out success: employee_id=${employeeId}, time=${finalCheckOutTime}`);

    return res.json({
      success: true,
      message: `Check-out thành công lúc ${finalCheckOutTime}! Chúc bạn một ngày tốt lành.`,
      data: {
        id: record.id,
        check_out: finalCheckOutTime
      }
    });
  } catch (err) {
    console.error('selfCheckOut error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi check-out: ' + err.message
    });
  }
}

async function getSelfHistory(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Tài khoản chưa liên kết với nhân viên'
      });
    }

    const { date, status } = req.query;
    let query = `
      SELECT 
        a.id,
        DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
        TIME_FORMAT(a.check_in, '%H:%i:%s') AS check_in,
        TIME_FORMAT(a.check_out, '%H:%i:%s') AS check_out,
        a.status,
        s.shift_name,
        TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(s.end_time, '%H:%i') AS end_time
      FROM attendance a
      JOIN shifts s ON a.shift_id = s.id
      WHERE a.employee_id = ?
    `;
    const params = [employeeId];

    if (date && date.trim() !== '') {
      query += ' AND a.attendance_date = ?';
      params.push(date.trim());
    }

    if (status && (status === 'ON_TIME' || status === 'LATE')) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    query += ' ORDER BY a.attendance_date DESC, a.check_in DESC';

    const [rows] = await pool.execute(query, params);
    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error('getSelfHistory error:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải lịch sử cá nhân: ' + err.message
    });
  }
}

module.exports = {
  getProfile,
  getTodayShift,
  getTodayAttendance,
  selfCheckIn,
  selfCheckOut,
  getSelfHistory
};
