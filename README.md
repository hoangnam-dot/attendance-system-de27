# attendance-system-de27
Đề 27 - Hệ thống Điểm danh / Attendance - Triển khai và Quản trị Hệ thống Phần mềm (Phase 1)

---

## 1. Giới thiệu Đề tài
Dự án xây dựng **Hệ thống Điểm danh (Attendance Management System)** phục vụ quản trị ca làm việc, phân ca, điểm danh nhân sự (Check-in / Check-out) và tra cứu lịch sử theo thời gian thực.
Hệ thống được container hóa hoàn toàn bằng **Docker Compose**, sử dụng **Nginx Reverse Proxy** kèm các tiêu chuẩn bảo mật (Security Headers), cơ sở dữ liệu quan hệ **MySQL 8.0** (chuẩn Unicode `utf8mb4`), công cụ quản trị **phpMyAdmin**, và backend **Node.js (Express)** phân quyền 2 vai trò rõ ràng: **ADMIN** và **EMPLOYEE**.

---

## 2. Kiến trúc Hệ thống (Phase 1)

Hệ thống hoạt động theo mô hình Reverse Proxy nhiều tầng trong mạng Docker bridge (`attendance_network`):

```
                                [ Trình duyệt / Client ]
                                            │
                        Port 80             │          Port 8080
               ┌────────────────────────────┴──────────────────────────┐
               ▼                                                       ▼
         ┌──────────────────┐                               ┌───────────────────┐
         │  attendance_nginx│                               │attendance_phpadmin│
         │  (Reverse Proxy) │                               │   (Port 8080)     │
         └────────┬─────────┘                               └─────────┬─────────┘
                  │ proxy_pass: http://app:3000                       │
                  ▼                                                   │
         ┌──────────────────┐                                         │
         │  attendance_app  │                                         │
         │ (Node.js/Express)│                                         │
         └────────┬─────────┘                                         │
                  │ (hostname: mysql, port 3306, utf8mb4)             │
                  └─────────────────────────┬─────────────────────────┘
                                            ▼
                                 ┌─────────────────────┐
                                 │  attendance_mysql   │
                                 │ (MySQL 8.0 & Volume)│
                                 └─────────────────────┘
```

1. **Client / Browser:** Người dùng truy cập hệ thống qua cổng HTTP chuẩn: `http://localhost/`.
2. **Nginx Reverse Proxy (`attendance_nginx`):** Tiếp nhận request tại cổng 80, gán các Security Headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`), mã hóa ký tự `charset utf-8;`, nén gzip và proxy forward sang backend `app:3000`.
3. **Application Backend & Frontend (`attendance_app`):** Node.js Express cung cấp REST API, xác thực JWT, phân quyền RBAC và phục vụ 2 giao diện:
   - **Admin Dashboard (`/index.html`):** Quản trị toàn hệ thống.
   - **Employee Portal (`/employee.html`):** Bàn làm việc cá nhân, tự điểm danh, xem ca và lịch sử.
4. **Database (`attendance_mysql`):** MySQL 8.0 được cấu hình `utf8mb4` toàn diện, lưu trữ dữ liệu an toàn trên named volume `attendance_mysql_data`, giám sát sẵn sàng qua Docker healthcheck.
5. **Database Admin Tool (`attendance_phpmyadmin`):** phpMyAdmin chạy tại cổng `http://localhost:8080`, kết nối trực tiếp vào MySQL qua mạng nội bộ Docker.

---

## 3. Phân quyền Người dùng (Role-Based Access Control)

Hệ thống hỗ trợ 2 vai trò người dùng độc lập:

| Vai trò | Phạm vi & Quyền hạn | Giao diện điều hướng |
|---|---|---|
| **ADMIN** | Toàn quyền quản trị hệ thống: Dashboard thống kê, CRUD nhân viên, CRUD ca làm, phân ca (`employee_shifts`), điểm danh hộ, xem toàn bộ lịch sử điểm danh. Không có quyền truy cập vào endpoint điểm danh cá nhân của Employee. | Chuyển đến `/` (Admin Dashboard) |
| **EMPLOYEE** | Chỉ quản lý dữ liệu của chính mình: Xem thông tin cá nhân, xem ca làm hôm nay được phân, tự Check-in / Check-out cho chính mình (không thể can thiệp dữ liệu người khác), xem lịch sử điểm danh cá nhân. Bị chặn hoàn toàn (HTTP 403) khỏi các API quản trị Admin. | Chuyển đến `/employee.html` (Employee Portal) |

---

## 4. Database Schema (`attendance_db`)

Bộ cơ sở dữ liệu được thiết kế chuẩn mực với mã hóa `utf8mb4` và collation `utf8mb4_unicode_ci`:

1. **`users`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `username VARCHAR(50) NOT NULL UNIQUE`
   - `password_hash VARCHAR(255) NOT NULL` *(bcrypt cost 10, không lưu plaintext)*
   - `role ENUM('ADMIN', 'EMPLOYEE') NOT NULL DEFAULT 'ADMIN'`
   - `employee_id INT NULL` *(Khóa ngoại tham chiếu `employees(id)`, bắt buộc đối với vai trò EMPLOYEE)*
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
2. **`employees`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `employee_code VARCHAR(50) NOT NULL UNIQUE`
   - `full_name VARCHAR(100) NOT NULL` *(hỗ trợ tiếng Việt có dấu hoàn hảo)*
   - `email VARCHAR(100) NOT NULL`
   - `department VARCHAR(100) NOT NULL`
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
3. **`shifts`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `shift_name VARCHAR(50) NOT NULL`
   - `start_time TIME NOT NULL`
   - `end_time TIME NOT NULL`
4. **`employee_shifts` (Phân ca làm việc)**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `employee_id INT NOT NULL` *(FK -> `employees(id)` ON DELETE CASCADE)*
   - `shift_id INT NOT NULL` *(FK -> `shifts(id)` ON DELETE CASCADE)*
   - `work_date DATE NOT NULL`
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
   - `CONSTRAINT unique_employee_work_date UNIQUE (employee_id, work_date)` *(Đảm bảo mỗi nhân viên chỉ có 1 ca được phân trong 1 ngày)*
5. **`attendance`**:
   - `id INT AUTO_INCREMENT PRIMARY KEY`
   - `employee_id INT NOT NULL` *(FK -> `employees(id)` ON DELETE CASCADE)*
   - `shift_id INT NOT NULL` *(FK -> `shifts(id)` ON DELETE CASCADE)*
   - `attendance_date DATE NOT NULL`
   - `check_in TIME NOT NULL`
   - `check_out TIME NULL`
   - `status ENUM('ON_TIME', 'LATE') NOT NULL DEFAULT 'ON_TIME'`
   - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
   - `CONSTRAINT unique_employee_shift_date UNIQUE (employee_id, shift_id, attendance_date)` *(Chống điểm danh trùng)*

---

## 5. Hướng dẫn Triển khai & Vận hành

### 5.1. Chuẩn bị Môi trường
- Đảm bảo máy tính đã cài đặt **Docker** và **Docker Compose**.
- File cấu hình môi trường `.env` mẫu được cung cấp tại `.env.example`:
  ```bash
  cp .env.example .env
  ```

### 5.2. Khởi chạy Toàn bộ Hệ thống
Chạy lệnh sau tại thư mục gốc dự án:
```bash
docker compose up -d --build
```

### 5.3. Kiểm tra Trạng thái Container
Xem danh sách và trạng thái sức khỏe của các container:
```bash
docker compose ps
```
Tất cả 4 containers (`attendance_mysql`, `attendance_app`, `attendance_nginx`, `attendance_phpmyadmin`) đều ở trạng thái **Up** / **healthy**.

### 5.4. Dừng Hệ thống
- Dừng hệ thống:
  ```bash
  docker compose down
  ```
- Dừng và xóa dữ liệu database nếu muốn khởi tạo lại từ đầu (reset development volume):
  ```bash
  docker compose down -v
  ```

---

## 6. Đường dẫn Truy cập & Tài khoản Demo

| Dịch vụ | URL Truy cập | Ghi chú |
|---|---|---|
| **Website Chính** | [http://localhost](http://localhost) | Qua Nginx Reverse Proxy (Cổng 80) |
| **Trang Đăng Nhập** | [http://localhost/login.html](http://localhost/login.html) | Tự động phân quyền điều hướng theo vai trò |
| **Cổng Nhân Viên** | [http://localhost/employee.html](http://localhost/employee.html) | Bàn làm việc & Điểm danh nhân viên |
| **phpMyAdmin** | [http://localhost:8080](http://localhost:8080) | Quản trị CSDL MySQL trực quan |

### 6.1. Tài khoản Demo Đăng nhập Website

| Loại tài khoản | Tên đăng nhập | Mật khẩu | Nhân viên liên kết | Ca hôm nay |
|---|---|---|---|---|
| **Admin** | `admin` | `admin123` | *Quản trị viên hệ thống* | Toàn quyền |
| **Employee** | `nv001` | `nv001123` | NV001 - Nguyễn Văn An | Ca Sáng (08:00 - 12:00) |
| **Employee** | `nv002` | `nv002123` | NV002 - Trần Thị Bích | Ca Chiều (13:30 - 17:30) |
| **Employee** | `nv003` | `nv003123` | NV003 - Lê Hoàng Nam | Ca Sáng (08:00 - 12:00) |

*(Trên trang đăng nhập có các nút chọn nhanh tài khoản demo để tiện trình diễn).*

### 6.2. Tài khoản phpMyAdmin
- **Server:** `mysql`
- **Username:** `root`
- **Password:** Được cấu hình trong file `.env` (không lưu trữ công khai trên GitHub)
- **Database:** `attendance_db`

---

## 7. Quy tắc Nghiệp vụ Điểm danh & Phân quyền

1. **Quy tắc Phân ca làm việc:**
   - Admin gán ca cho từng nhân viên theo từng ngày cụ thể (`employee_shifts`).
   - Ràng buộc Unique bảo đảm 1 nhân viên chỉ có 1 ca phân công mỗi ngày.
2. **Quy tắc Check-in:**
   - Nhân viên chỉ được điểm danh khi đã có ca phân công trong ngày đó.
   - So sánh giờ check-in với giờ bắt đầu ca:
     - Nếu `check_in > start_time` ➔ Trạng thái tự động gắn là **`LATE`** (Đi muộn).
     - Nếu `check_in <= start_time` ➔ Trạng thái tự động gắn là **`ON_TIME`** (Đúng giờ).
   - Chặn tuyệt đối điểm danh trùng lặp (trả về HTTP `409 Conflict`).
3. **Quy tắc Check-out:**
   - Nhân viên chỉ được Check-out cho chính bản ghi của mình sau khi đã Check-in.
   - Không cho phép Check-out nhiều lần (trả về HTTP `400 Bad Request`).
4. **Bảo mật API:**
   - Nếu không có token đăng nhập ➔ HTTP `401 Unauthorized`.
   - Nếu sai vai trò (Employee cố gọi API Admin hoặc ngược lại) ➔ HTTP `403 Forbidden`.
