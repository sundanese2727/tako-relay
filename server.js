// ============================================================
//  TAKO -> ROBLOX RELAY SERVER
// ============================================================
// Tugasnya cuma 2:
//   1. Terima callback POST dari Tako.id tiap ada donasi sukses
//   2. Simpan sementara di memori, siap diambil (polling) oleh
//      game Roblox lewat HttpService
//
// ENV VARIABLES yang WAJIB di-set di Railway:
//   TAKO_CALLBACK_SECRET   -> Callback Secret dari dashboard Tako
//                             (dipakai buat verifikasi signature)
//   ROBLOX_SHARED_SECRET   -> Password bikinan lu sendiri, bebas,
//                             dipakai biar cuma Roblox game lu yang
//                             bisa ambil data donasi dari endpoint
//                             /donations
// ============================================================

const express = require("express");
const crypto = require("crypto");

const app = express();

// Tako ngirim JSON body. Kita perlu raw body juga buat verifikasi HMAC.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const TAKO_CALLBACK_SECRET = process.env.TAKO_CALLBACK_SECRET || "";
const ROBLOX_SHARED_SECRET = process.env.ROBLOX_SHARED_SECRET || "";
// API key yang sama kayak yang lu pakai buat Callback URL di dashboard Tako.
// Dipakai buat ambil nama/pesan donatur lewat GET /api/v1/gift/{giftId},
// soalnya body callback bawaan Tako CUMA ngasih nominal, bukan nama.
const TAKO_API_KEY = process.env.TAKO_API_KEY || "";

if (!ROBLOX_SHARED_SECRET) {
  console.warn(
    "[WARNING] ROBLOX_SHARED_SECRET belum di-set! Endpoint /donations akan TERBUKA buat siapa aja. Set env var ini di Railway."
  );
}

// Antrian donasi yang belum diambil Roblox.
// Simpel pakai array in-memory (cukup buat kebutuhan kayak gini,
// karena Roblox bakal polling tiap beberapa detik).
let pendingDonations = [];

// Simpen juga histori ringkas (opsional, buat debug lewat GET /health)
let totalReceived = 0;

// --------------------------------------------------------------
// 1) ENDPOINT: Callback dari Tako
//    Diset di https://tako.id/me/api-keys sebagai "Callback URL"
//    Contoh: https://nama-app-lu.up.railway.app/webhook/tako
// --------------------------------------------------------------
app.post("/webhook/tako", async (req, res) => {
  const signatureHeader = req.header("X-Tako-Signature");

  // Kalau Callback Secret diisi di dashboard Tako, kita WAJIB
  // verifikasi signature-nya biar nggak ada orang lain yang bisa
  // ngirim donasi "palsu" ke server kita.
  if (TAKO_CALLBACK_SECRET) {
    if (!signatureHeader) {
      console.warn("Callback ditolak: signature header nggak ada.");
      return res.status(401).json({ error: "missing signature" });
    }

    const computed = crypto
      .createHmac("sha256", TAKO_CALLBACK_SECRET)
      .update(req.rawBody)
      .digest("hex");

    const valid =
      computed.length === signatureHeader.length &&
      crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));

    if (!valid) {
      console.warn("Callback ditolak: signature nggak cocok.");
      return res.status(401).json({ error: "invalid signature" });
    }
  }

  const body = req.body;

  if (body?.event !== "payment.success") {
    // Event lain (kalau ada ke depannya) -> abaikan aja, tetep balas 200
    return res.status(200).json({ ok: true, ignored: true });
  }

  const data = body.data || {};

  const donation = {
    id: data.id,
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    createdAt: data.createdAt,
    isGift: data.relatedGiftId !== null && data.relatedGiftId !== undefined,
    receivedAt: new Date().toISOString(),
    name: null, // diisi di bawah kalau berhasil fetch detail hadiah
    message: null,
  };

  // Kalau ini donasi lewat halaman "Kirim Hadiah" (relatedGiftId ada) dan
  // kita punya API key, ambil nama & pesan donaturnya.
  if (donation.isGift && TAKO_API_KEY) {
    try {
      const giftRes = await fetch(
        `https://tako.id/api/v1/gift/${data.relatedGiftId}`,
        {
          headers: {
            Authorization: `Bearer ${TAKO_API_KEY}`,
            "User-Agent": "equilibrium-obstacle-relay/1.0",
          },
        }
      );
      const giftJson = await giftRes.json();
      const gift = giftJson?.result;
      if (gift) {
        donation.name = gift.gifterName || null;
        donation.message = gift.message || null;
      }
    } catch (err) {
      console.warn("Gagal ambil detail hadiah:", err.message);
    }
  }

  pendingDonations.push(donation);
  totalReceived += 1;

  console.log("Donasi baru diterima:", donation);

  return res.status(200).json({ ok: true });
});

// --------------------------------------------------------------
// 2b) ENDPOINT KHUSUS TESTING: simulasi donasi tanpa perlu
//     donasi beneran. Cukup buka URL ini di browser.
//     Contoh: /debug/simulate?key=SECRET&name=Budi&amount=25000
// --------------------------------------------------------------
app.get("/debug/simulate", (req, res) => {
  const key = req.query.key;

  if (ROBLOX_SHARED_SECRET && key !== ROBLOX_SHARED_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }

  const donation = {
    id: "simulasi-" + Date.now(),
    amount: Number(req.query.amount) || 25000,
    paymentMethod: "qris (simulasi)",
    createdAt: new Date().toISOString(),
    isGift: true,
    receivedAt: new Date().toISOString(),
    name: req.query.name || "Tester",
    message: req.query.message || "Ini donasi simulasi buat testing!",
  };

  pendingDonations.push(donation);
  totalReceived += 1;

  return res.json({ ok: true, simulated: donation });
});

// --------------------------------------------------------------
// 2c) ENDPOINT: Di-polling sama Roblox game server
//    Roblox manggil ini tiap beberapa detik pakai HttpService.
//    Setiap donasi yang udah diambil bakal dihapus dari antrian
//    (biar nggak double-notif).
// --------------------------------------------------------------
app.get("/donations", (req, res) => {
  const key = req.header("X-Shared-Secret") || req.query.key;

  if (ROBLOX_SHARED_SECRET && key !== ROBLOX_SHARED_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }

  const toSend = pendingDonations;
  pendingDonations = []; // kosongin antrian, udah "diambil" Roblox

  return res.json({ donations: toSend });
});

// --------------------------------------------------------------
// 3) Health check simpel (buka manual di browser buat mastiin
//    server hidup, dan liat berapa donasi yang udah pernah masuk)
// --------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    totalReceived,
    pendingCount: pendingDonations.length,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tako relay server jalan di port ${PORT}`);
});
