-- Set explicit UTF-8 character encoding for MySQL client session
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Initialize Attendance Database
CREATE DATABASE IF NOT EXISTS attendance_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE attendance_db;

-- 1. Table employees
CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table shifts
CREATE TABLE IF NOT EXISTS shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table users (Supports ADMIN & EMPLOYEE)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'EMPLOYEE') NOT NULL DEFAULT 'ADMIN',
    employee_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table employee_shifts (Phân ca làm việc: 1 nhân viên có 1 ca / ngày)
CREATE TABLE IF NOT EXISTS employee_shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    shift_id INT NOT NULL,
    work_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_employee_work_date UNIQUE (employee_id, work_date),
    CONSTRAINT fk_empshifts_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_empshifts_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Table attendance
CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    shift_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    check_in TIME NOT NULL,
    check_out TIME NULL,
    status ENUM('ON_TIME', 'LATE') NOT NULL DEFAULT 'ON_TIME',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_employee_shift_date UNIQUE (employee_id, shift_id, attendance_date),
    CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexes for performance
CREATE INDEX idx_attendance_date ON attendance(attendance_date);
CREATE INDEX idx_attendance_status ON attendance(status);
CREATE INDEX idx_attendance_emp_date ON attendance(employee_id, attendance_date);
CREATE INDEX idx_empshifts_date ON employee_shifts(work_date);

-- ==========================================
-- SEED DATA
-- ==========================================

-- Seed Shifts (3 ca làm việc)
INSERT INTO shifts (id, shift_name, start_time, end_time) VALUES
(1, 'Ca Sáng (08:00 - 12:00)', '08:00:00', '12:00:00'),
(2, 'Ca Chiều (13:30 - 17:30)', '13:30:00', '17:30:00'),
(3, 'Ca Tối (18:00 - 22:00)', '18:00:00', '22:00:00')
ON DUPLICATE KEY UPDATE id=id;

-- Seed Employees (8 nhân viên chuẩn tiếng Việt có dấu)
INSERT INTO employees (id, employee_code, full_name, email, department) VALUES
(1, 'NV001', 'Nguyễn Văn An', 'an.nv@company.com', 'Công nghệ thông tin'),
(2, 'NV002', 'Trần Thị Bích', 'bich.tt@company.com', 'Nhân sự'),
(3, 'NV003', 'Lê Hoàng Nam', 'nam.lh@company.com', 'Kỹ thuật phần mềm'),
(4, 'NV004', 'Phạm Minh Đức', 'duc.pm@company.com', 'Kế toán'),
(5, 'NV005', 'Hoàng Thùy Linh', 'linh.ht@company.com', 'Marketing'),
(6, 'NV006', 'Đặng Quang Hải', 'hai.dq@company.com', 'Kinh doanh'),
(7, 'NV007', 'Vũ Mai Phương', 'phuong.vm@company.com', 'Chăm sóc khách hàng'),
(8, 'NV008', 'Bùi Tuấn Anh', 'anh.bt@company.com', 'Quản trị hệ thống')
ON DUPLICATE KEY UPDATE id=id;

-- Seed Users: 1 ADMIN + 3 EMPLOYEE accounts
-- Passwords hashed via bcrypt:
-- admin / admin123
-- nv001 / nv001123
-- nv002 / nv002123
-- nv003 / nv003123
INSERT INTO users (id, username, password_hash, role, employee_id) VALUES
(1, 'admin', '$2a$10$.kkcsC6RzJDDOdIMSRPI5.KXOZIzE/b1xK8wj2J1/9p9UtT0VAmI6', 'ADMIN', NULL),
(2, 'nv001', '$2a$10$N.IuuuVmn/dFJeC0q3jQce6hW1U432C4QXrb2jjxsRcLTNoCl491y', 'EMPLOYEE', 1),
(3, 'nv002', '$2a$10$eWFOjC0aw59PjvBJPp4ACe95cRcfqUdS6d8GqD0oVhX9lcb0KeLoe', 'EMPLOYEE', 2),
(4, 'nv003', '$2a$10$WYF/.1TnEwrVR9xfLFITMudFDVfK6HjtxHvF22mCYJ51KVxd/5Taa', 'EMPLOYEE', 3)
ON DUPLICATE KEY UPDATE id=id;

-- Seed Employee Shift Assignments (Phân ca làm việc)
INSERT INTO employee_shifts (employee_id, shift_id, work_date) VALUES
-- Yesterday
(1, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
(2, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
(3, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
(4, 2, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
-- Today (Cho các tài khoản demo có thể check-in ngay)
(1, 1, CURDATE()), -- nv001: Ca Sáng
(2, 2, CURDATE()), -- nv002: Ca Chiều
(3, 1, CURDATE()), -- nv003: Ca Sáng
(4, 2, CURDATE()),
(5, 2, CURDATE())
ON DUPLICATE KEY UPDATE id=id;

-- Seed Attendance Records
INSERT INTO attendance (employee_id, shift_id, attendance_date, check_in, check_out, status) VALUES
-- Yesterday
(1, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '07:50:00', '12:02:00', 'ON_TIME'),
(2, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '08:20:00', '12:00:00', 'LATE'),
(3, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '07:58:00', '12:05:00', 'ON_TIME'),
(4, 2, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '13:28:00', '17:35:00', 'ON_TIME'),
-- Today:
-- nv001: Chưa điểm danh hôm nay (sẵn sàng để test check-in)
-- nv002: Chưa điểm danh hôm nay (sẵn sàng để test check-in)
-- nv003: Đã check-in lúc 07:58:00, chưa check-out (sẵn sàng để test check-out)
(3, 1, CURDATE(), '07:58:00', NULL, 'ON_TIME'),
(4, 2, CURDATE(), '13:38:00', NULL, 'LATE')
ON DUPLICATE KEY UPDATE id=id;
