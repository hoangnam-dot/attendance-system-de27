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

---

## 8. Kiến trúc Giám sát Hệ thống (Phase 2: Prometheus & Grafana)

Hệ thống được tích hợp giải pháp giám sát tập trung toàn diện theo thời gian thực chuẩn công nghiệp với **Prometheus** và **Grafana**, thu thập metrics đa tầng từ Container, Web Server (Nginx) đến Database (MySQL).

### 8.1. Sơ đồ Luồng Thu thập Metrics (Monitoring Flow)

```
       ┌────────────────────────┐      ┌────────────────────────┐
       │   attendance_cadvisor  │      │attendance_nginx_export│
       │    (Container Stats)   │      │    (Nginx stub_status) │
       │       Port: 8080       │      │       Port: 9113       │
       └───────────┬────────────┘      └───────────┬────────────┘
                   │                               │
                   │ pull metrics (15s)            │ pull metrics (15s)
                   ▼                               ▼
       ┌────────────────────────────────────────────────────────┐
       │                 attendance_prometheus                  │
       │           (Prometheus Server v3.15.1 - 9090)           │
       │               Volume: prometheus_data                  │
       └───────────▲───────────────────────────────▲────────────┘
                   │                               │
                   │ pull metrics (15s)            │ pull metrics (15s)
       ┌───────────┴────────────┐      ┌───────────┴────────────┐
       │attendance_mysql_export │      │       Prometheus       │
       │  (mysqld_exporter 9104)│      │    (Self-monitoring)   │
       │     (User: exporter)   │      │       Port: 9090       │
       └────────────────────────┘      └────────────────────────┘
                   ▲
                   │ PromQL query API
                   │
       ┌────────────────────────┐
       │   attendance_grafana   │
       │ (Grafana v13.2.4: 3001)│
       │  Volume: grafana_data  │
       └────────────────────────┘
```

### 8.2. Các Thành phần Giám sát

1. **Prometheus Server (`attendance_prometheus` - `prom/prometheus:v3.15.1`):**
   - Thu thập định kỳ (pull model) qua `scrape_interval: 15s`.
   - Quản lý 4 scrape jobs: `prometheus`, `cadvisor`, `nginx`, `mysql`.
   - Lưu trữ dữ liệu TSDB trên named volume `attendance_prometheus_data`.
   - Cung cấp giao diện truy vấn PromQL tại cổng `9090`.

2. **cAdvisor Container Monitoring (`attendance_cadvisor` - `ghcr.io/google/cadvisor:0.60.6`):**
   - Giám sát tài nguyên phần cứng tiêu thụ của toàn bộ Docker containers: CPU, RAM working set, Network I/O.
   - Cấu hình đặc thù tương thích Docker Desktop WSL2 (`privileged: true`, device `/dev/kmsg`, mount `/rootfs`, `/sys`, `/var/run`, `/var/lib/docker/`).
   - Xuất metrics thật gắn nhãn container: `attendance_app`, `attendance_mysql`, `attendance_nginx`, `attendance_phpmyadmin`...

3. **NGINX Prometheus Exporter (`attendance_nginx_exporter` - `nginx/nginx-prometheus-exporter:1.5.3`):**
   - Kết nối tới endpoint nội bộ `http://nginx:8080/stub_status` do Nginx phục vụ (không mở ra ngoài host).
   - Chuyển đổi trạng thái Nginx sang Prometheus metrics tại cổng nội bộ `9113`.
   - Đo lường: Active connections, accepted connections, handled connections, tổng số request HTTP và request rate.

4. **MySQL Prometheus Exporter (`attendance_mysql_exporter` - `prom/mysqld-exporter:v0.20.0`):**
   - Kết nối tới MySQL qua user chuyên dụng `exporter` với nguyên tắc đặc quyền tối thiểu (Least Privilege: `PROCESS`, `REPLICATION CLIENT`, `SELECT`).
   - Mật khẩu được nạp tự động qua biến môi trường `MYSQL_EXPORTER_PASSWORD` trong `.env` (không hardcode vào config hay file schema).
   - Khi triển khai mới (fresh deployment), file `database/init-exporter.sh` tự động được MySQL `/docker-entrypoint-initdb.d/` thực thi để khởi tạo user `exporter` khớp chính xác với `MYSQL_EXPORTER_PASSWORD` trong `.env`.
   - Đo lường: Uptime, trạng thái kết nối `mysql_up`, số lượng threads đang active, queries/s, questions/s, dữ liệu bộ đệm InnoDB Buffer Pool.

5. **Grafana Visualizations & Dashboards (`attendance_grafana` - `grafana/grafana:13.2.4`):**
   - Giao diện trực quan hóa dữ liệu tại cổng `3001`.
   - **Tự động Provisioning:**
     - Datasource Prometheus được tự động kết nối qua `grafana/provisioning/datasources/datasource.yml` (`http://prometheus:9090`).
     - Dashboard **Attendance System Monitoring** được tự động import qua `grafana/provisioning/dashboards/` từ file `attendance-monitoring.json`.
   - Không yêu cầu thao tác cấu hình thủ công trong UI sau khi khởi chạy.

---

## 9. Bảng Đường dẫn Dịch vụ & Giám sát

| Dịch vụ | URL Truy cập | Tài khoản / Quyền | Mục đích |
|---|---|---|---|
| **Website Chính** | [http://localhost](http://localhost) | `admin` / `nv001` (xem mục 6.1) | Điểm danh & Quản trị nhân sự |
| **phpMyAdmin** | [http://localhost:8080](http://localhost:8080) | `root` / cấu hình `.env` | Quản trị CSDL MySQL |
| **Prometheus Web UI** | [http://localhost:9090](http://localhost:9090) | Truy cập trực tiếp | Kiểm tra metrics & PromQL console |
| **Prometheus Targets** | [http://localhost:9090/targets](http://localhost:9090/targets) | Truy cập trực tiếp | Kiểm tra trạng thái 4 Scrape Jobs |
| **Grafana Web UI** | [http://localhost:3001](http://localhost:3001) | `admin` / cấu hình `.env` | Đăng nhập hệ thống giám sát Grafana |
| **Grafana Dashboard** | [http://localhost:3001/d/attendance-monitoring/attendance-system-monitoring](http://localhost:3001/d/attendance-monitoring/attendance-system-monitoring) | Đăng nhập Grafana | Dashboard **Attendance System Monitoring** |

*(Lưu ý: Mật khẩu quản trị Grafana `GRAFANA_ADMIN_PASSWORD` và MySQL Exporter `MYSQL_EXPORTER_PASSWORD` được bảo mật trong file `.env` cá nhân, không commit vào repository).*

---

## 10. Các Câu truy vấn PromQL Tiêu biểu trong Dashboard

### 10.1. Nhóm Container (cAdvisor)
- **Container CPU Usage (%):**
  ```promql
  sum by (name) (rate(container_cpu_usage_seconds_total{name=~"attendance_.*"}[1m])) * 100
  ```
- **Container Memory Usage (Working Set):**
  ```promql
  sum by (name) (container_memory_working_set_bytes{name=~"attendance_.*"})
  ```
- **Container Network Receive (Bytes/s):**
  ```promql
  sum by (name) (rate(container_network_receive_bytes_total{name=~"attendance_.*",interface="eth0"}[1m]))
  ```
- **Container Network Transmit (Bytes/s):**
  ```promql
  sum by (name) (rate(container_network_transmit_bytes_total{name=~"attendance_.*",interface="eth0"}[1m]))
  ```

### 10.2. Nhóm Nginx Web Server
- **Trạng thái NGINX Up (1 = UP, 0 = DOWN):**
  ```promql
  nginx_up
  ```
- **Kết nối đang hoạt động (Active Connections):**
  ```promql
  nginx_connections_active
  ```
- **Tổng số Request HTTP:**
  ```promql
  nginx_http_requests_total
  ```
- **Tốc độ Request HTTP (req/s):**
  ```promql
  rate(nginx_http_requests_total[1m])
  ```

### 10.3. Nhóm MySQL Database
- **Trạng thái MySQL Up (1 = UP, 0 = DOWN):**
  ```promql
  mysql_up
  ```
- **Thời gian hoạt động MySQL (Uptime - Giây):**
  ```promql
  mysql_global_status_uptime
  ```
- **Số lượng kết nối đang mở (Threads Connected):**
  ```promql
  mysql_global_status_threads_connected
  ```
- **Tốc độ thực thi truy vấn (Queries/s):**
  ```promql
  rate(mysql_global_status_queries[1m])
  ```
- **Bộ nhớ đệm dữ liệu InnoDB Buffer Pool (Bytes):**
  ```promql
  mysql_global_status_innodb_buffer_pool_bytes_data
  ```

### 10.4. Nhóm Prometheus System
- **Số lượng Target đang hoạt động:**
  ```promql
  sum(up{job=~"prometheus|cadvisor|nginx|mysql"})
  ```
- **Chi tiết từng Scrape Job:**
  ```promql
  up{job=~"prometheus|cadvisor|nginx|mysql"}
  ```

---

## 11. Hướng dẫn Xử lý Sự cố Giám sát (Troubleshooting)

### 11.1. Target `nginx` báo DOWN (Health: DOWN)
1. Kiểm tra container `attendance_nginx` và `attendance_nginx_exporter` có đang chạy:
   ```bash
   docker compose ps nginx nginx-exporter
   ```
2. Kiểm tra Nginx có đang listen port 8080 cho `stub_status` không:
   ```bash
   docker compose exec nginx nginx -T | grep -A 8 "stub_status"
   ```
3. Nạp lại cấu hình Nginx mà không cần restart container:
   ```bash
   docker compose exec nginx nginx -s reload
   ```

### 11.2. Target `mysql` báo DOWN (Health: DOWN)
1. Kiểm tra MySQL container đã vượt qua Healthcheck (`healthy`):
   ```bash
   docker compose ps mysql
   ```
2. Kiểm tra quyền và user `exporter` trong MySQL:
   ```bash
   docker compose exec mysql mysql -u root -p -e "SHOW GRANTS FOR 'exporter'@'%';"
   ```
3. Đảm bảo biến `MYSQL_EXPORTER_PASSWORD` trong file `.env` khớp với mật khẩu user `exporter`.

### 11.3. Target `cadvisor` báo DOWN hoặc Không hiển thị tên Container
1. Kiểm tra logs container:
   ```bash
   docker compose logs cadvisor --tail 30
   ```
2. Trên Docker Desktop (Windows/WSL2), cAdvisor cần cờ `privileged: true` và mount đầy đủ `/rootfs`, `/sys`, `/var/run`, `/var/lib/docker/` và `/dev/disk/` để ánh xạ chính xác cgroups.
3. Kiểm tra endpoint metrics:
   ```bash
   curl.exe http://localhost:8080/metrics
   ```

### 11.4. Grafana không hiển thị Dashboard hoặc báo "Data source not found"
1. Kiểm tra trạng thái datasource qua API:
   ```bash
   curl.exe -s -u admin:your_password http://localhost:3001/api/datasources
   ```
2. Kiểm tra logs provisioning của Grafana:
   ```bash
   docker compose logs grafana | grep -E "provisioning|error"
   ```
3. Đảm bảo file cấu hình `datasource.yml` và `dashboard.yml` nằm đúng thư mục mount `./grafana/provisioning/`.

---

## 12. Danh mục Ảnh Minh chứng Cần chụp (Evidence Checklist)

Khi hoàn thiện toàn bộ hệ thống, chuẩn bị các ảnh chụp màn hình sau:
1. **Prometheus Targets UI:** Giao diện `http://localhost:9090/targets` hiển thị cả 4 jobs (`prometheus`, `cadvisor`, `nginx`, `mysql`) đều ở trạng thái màu xanh **UP (4/4)**.
2. **Grafana Dashboard Toàn cảnh:** Giao diện `http://localhost:3001` với dashboard **Attendance System Monitoring** đầy đủ 4 nhóm panels (Prometheus, NGINX, MySQL, Container Metrics).
3. **cAdvisor Container Metrics:** Panel Container CPU Usage & Memory Usage hiển thị dữ liệu thật của các container `attendance_app`, `attendance_mysql`, `attendance_nginx`, `attendance_phpmyadmin`.
4. **Nginx Web Server Metrics:** Panel NGINX hiển thị `nginx_up = 1`, Active Connections và Request counter tăng khi truy cập website.
5. **MySQL Database Metrics:** Panel MySQL hiển thị `mysql_up = 1`, Uptime, Threads Connected và Query Rate.
6. **Regression Test Website & phpMyAdmin:** Giao diện Admin Dashboard, Employee Portal check-in thành công và phpMyAdmin kết nối CSDL bình thường.
