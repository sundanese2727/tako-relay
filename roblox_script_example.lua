--[[
	TakoDonationRelayClient
	------------------------------------------------------------
	Taruh script ini di ServerScriptService.
	Pastikan HttpService (Allow HTTP Requests) udah dinyalain di
	Game Settings > Security.

	Tugas script ini:
	1. Polling endpoint /donations di relay server tiap N detik
	2. Tiap ada donasi baru, trigger event (bisa dipakai buat
	   notif chat, GUI popup, efek, dsb)
--]]

local HttpService = game:GetService("HttpService")

-- ============================================================
-- 	KONFIGURASI - GANTI DUA BARIS INI
-- ============================================================
local RELAY_URL = "https://GANTI-DENGAN-DOMAIN-RAILWAY-LU.up.railway.app"
local SHARED_SECRET = "GANTI-DENGAN-SECRET-YANG-SAMA-DI-RAILWAY"
local POLL_INTERVAL_SECONDS = 5
-- ============================================================

-- Bikin BindableEvent biar script lain (GUI, leaderboard, dst)
-- bisa "dengerin" tiap ada donasi baru tanpa perlu require file ini.
local donationEvent = Instance.new("BindableEvent")
donationEvent.Name = "OnTakoDonationReceived"
donationEvent.Parent = script

local function fetchDonations()
	local success, result = pcall(function()
		return HttpService:GetAsync(
			RELAY_URL .. "/donations?key=" .. HttpService:UrlEncode(SHARED_SECRET)
		)
	end)

	if not success then
		warn("[TakoRelay] Gagal fetch donasi:", result)
		return
	end

	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(result)
	end)

	if not ok or not decoded or not decoded.donations then
		return
	end

	for _, donation in ipairs(decoded.donations) do
		-- donation.amount, donation.paymentMethod, donation.createdAt, donation.isGift
		print(("[TakoRelay] Donasi baru masuk: Rp%d via %s"):format(
			donation.amount or 0,
			donation.paymentMethod or "?"
		))

		donationEvent:Fire(donation)
	end
end

-- Loop polling
task.spawn(function()
	while true do
		fetchDonations()
		task.wait(POLL_INTERVAL_SECONDS)
	end
end)

--[[
	CONTOH PEMAKAIAN DI SCRIPT LAIN (misal buat notif chat/GUI):

	local relayScript = game.ServerScriptService.TakoDonationRelayClient
	local event = relayScript:WaitForChild("OnTakoDonationReceived")

	event.Event:Connect(function(donation)
		-- Contoh: broadcast pesan ke semua player
		for _, player in ipairs(game.Players:GetPlayers()) do
			-- kirim ke GUI notif, atau pakai TextChatService buat announce
		end
	end)
--]]
