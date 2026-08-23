# Tako → Roblox Relay

Server kecil yang jadi jembatan antara Tako.id (donasi) dan game Roblox lu (EQUILIBRIUM OBSTACLE).

```
Player donate di Tako
      ↓
Tako POST ke /webhook/tako  (server ini)
      ↓  (disimpan sementara)
Roblox game server polling GET /donations tiap beberapa detik
      ↓
Muncul notif in-game
```

## 1. Deploy ke Railway

1. Buat akun di https://railway.app (bisa login pakai GitHub)
2. Klik **New Project** → **Deploy from GitHub repo** (upload folder ini ke GitHub dulu), atau pakai **Empty Project** lalu drag & drop folder ini / pakai Railway CLI:
   ```
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```
3. Setelah ke-deploy, buka tab **Variables**, tambahin dua env variable:
   - `ROBLOX_SHARED_SECRET` → bikin password sendiri, bebas, contoh: `sundara-tako-9x7f2q` (INI JANGAN DISHARE KE SIAPA-SIAPA, cuma buat rahasia antara server ini & Roblox lu)
   - `TAKO_CALLBACK_SECRET` → isi nanti setelah setup di langkah 3 (boleh dikosongin dulu buat testing awal, tapi WAJIB diisi sebelum live/production biar aman)
4. Railway otomatis kasih domain publik, contoh: `https://tako-roblox-relay-production.up.railway.app`
   → catat URL ini, itu yang dipakai di langkah berikutnya.

## 2. Cek server hidup

Buka di browser:
```
https://<domain-railway-lu>/health
```
Kalau muncul `{"status":"ok",...}` berarti server jalan normal.

## 3. Setup di dashboard Tako

1. Buka https://tako.id/me/api-keys
2. Buat API Key baru (atau pakai yang udah ada)
3. Isi **Callback URL** dengan:
   ```
   https://<domain-railway-lu>/webhook/tako
   ```
4. Isi **Callback Secret** dengan string rahasia bikinan lu sendiri (boleh sama atau beda dengan `ROBLOX_SHARED_SECRET`, ini KHUSUS buat verifikasi bahwa request beneran dari Tako)
5. Copy Callback Secret itu, paste ke env variable `TAKO_CALLBACK_SECRET` di Railway (lalu redeploy)

## 4. Setup di Roblox Studio

Lihat file `roblox_script_example.lua` — taruh isinya di sebuah **Script** di `ServerScriptService` pada project **EQUILIBRIUM OBSTACLE**.

Ganti dua baris di paling atas script:
```lua
local RELAY_URL = "https://<domain-railway-lu>"
local SHARED_SECRET = "sundara-tako-9x7f2q" -- harus SAMA PERSIS dengan ROBLOX_SHARED_SECRET di Railway
```

Pastikan **HttpService** di-enable dulu:
`Game Settings` → tab `Security` → nyalain `Allow HTTP Requests`.

## 5. Testing

- Coba kirim donasi kecil ke akun Tako lu sendiri (atau minta temen)
- Cek log Railway, harus muncul `"Donasi baru diterima: ..."`
- Di Roblox Studio, jalanin Play mode → dalam beberapa detik notif harus muncul di output/chat

## Catatan penting

- Data donasi di server ini **cuma numpang lewat sementara** (in-memory), begitu diambil Roblox langsung kehapus dari antrian. Kalau butuh histori donasi permanen (misal buat leaderboard "Top Donatur"), tinggal ke depannya, sebaiknya simpan itu di Roblox lewat DataStore (bukan di server relay ini).
- Kalau Railway restart server (jarang tapi bisa terjadi), donasi yang belum sempat di-polling Roblox bakal hilang. Buat kebutuhan sekarang ini masih oke, tapi kalau mau lebih tahan-banting ke depannya bisa upgrade nyimpen ke database kecil (misal Redis atau file).
