# TikTok Live Fishing Game

## Cách chạy nhanh
1. Giải nén file `tiktok-fishing-game.zip`.
2. Mở Terminal / CMD tại thư mục `tiktok-fishing-game` và cài thư viện:
   ```bash
   npm install
   ```
3. Chạy Node server (đây là server nhận sự kiện TikTok và WebSocket; không chạy riêng Vite):
   - **Windows (CMD):**
     ```cmd
     set TIKTOK_USER=ten_kenh_cua_ban && npm start
     ```
   - **Windows (PowerShell):**
     ```powershell
     $env:TIKTOK_USER="ten_kenh_cua_ban"; npm start
     ```
   - **Mac / Linux:**
     ```bash
     TIKTOK_USER=ten_kenh_cua_ban npm start
     ```
   Username là tên kênh không có `@`. Nếu bỏ qua biến này, server dùng username mặc định trong `server.js`.
4. Mở `http://localhost:3000` trên trình duyệt hoặc thêm địa chỉ server vào **TikTok Live Studio / OBS** (Browser Source kích thước `450 x 800`). Server cần chạy liên tục và host phải hỗ trợ WebSocket. Khi dùng HTTPS, giao diện tự kết nối bằng WSS.
5. Nhấn phím **`H`** để ẩn thanh nút test khi phát live chính thức.
