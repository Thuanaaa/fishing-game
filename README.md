# TikTok Live Fishing Game

## Cách chạy nhanh
1. Giải nén file `tiktok-fishing-game.zip`.
2. Mở Terminal / CMD tại thư mục `tiktok-fishing-game` và cài thư viện:
   ```bash
   npm install
   ```
3. Chạy server (thay `ten_kenh_cua_ban` bằng username TikTok Live của bạn, không có `@`):
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
4. Mở `http://localhost:3000` trên trình duyệt hoặc thêm vào **TikTok Live Studio / OBS** (Browser Source kích thước `450 x 800`).
5. Nhấn phím **`H`** để ẩn thanh nút test khi phát live chính thức.
