const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const axios = require("axios"); // ✅ API 호출용 추가

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// 세션 설정
app.use(session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false
}));

// ✅ FPS.MS API URL (여기 주소를 실제 서버 주소/포트로 수정하세요)
const FPSMS_API_URL = "http://<YOUR_FPSMS_HOST>:4000/api/accounts";

// FPS.MS에서 계정 불러오기
async function loadWebAccounts() {
    try {
        const res = await axios.get(FPSMS_API_URL);
        return res.data || {};
    } catch (err) {
        console.error("❌ FPS.MS 계정 API 불러오기 실패:", err.message);
        return {};
    }
}

// ========== 기본 페이지 ==========
app.get("/", (req, res) => {
    if (req.session.guildId) {
        return res.redirect("/success");
    }
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

// ========== WebAccount (아이디/비번) 로그인 ==========
app.post("/local-login", async (req, res) => {
    const { username, password } = req.body;

    // ✅ FPS.MS API에서 계정 불러오기
    const accounts = await loadWebAccounts();

    const account = Object.values(accounts).find(
        acc => acc.username === username && acc.password === password
    );

    if (!account) {
        return res.status(401).json({ error: "아이디 또는 비밀번호가 잘못되었습니다." });
    }

    // ✅ 로그인 성공 → 세션에 guildId 저장
    req.session.guildId = account.guildId;
    req.session.username = account.username;

    res.json({ success: true, guildId: account.guildId });
});

// 로그아웃
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// ========== 패널 접근 ==========
app.get("/success", (req, res) => {
    if (!req.session.guildId) return res.redirect("/");
    res.sendFile(path.join(__dirname, "views", "success.html"));
});

// ========== 티켓 설정 API ==========
const CONFIG_FILE = path.join(__dirname, "data", "ticket_config.json");

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
    return { servers: {} };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function ensureServerConfig(config, guildId) {
    if (!config.servers[guildId]) {
        config.servers[guildId] = {
            buttons: [],
            categories: {},
            sellerRoles: [],
            embed: {},
            notice: {},
            title: {}
        };
    }
}

// 버튼 저장
app.post("/api/ticket-config/button", (req, res) => {
    if (!req.session.guildId) return res.status(401).json({ error: "로그인이 필요합니다." });

    const { button } = req.body;
    const guildId = req.session.guildId;

    if (!button) return res.status(400).json({ error: "button 데이터는 필수입니다." });

    const config = loadConfig();
    ensureServerConfig(config, guildId);

    const idx = config.servers[guildId].buttons.findIndex(b => b.id === button.id);
    if (idx >= 0) {
        config.servers[guildId].buttons[idx] = button;
    } else {
        config.servers[guildId].buttons.push(button);
    }

    saveConfig(config);
    res.json({ success: true, config: config.servers[guildId] });
});

// 임베드 저장
app.post("/api/ticket-config/embed", (req, res) => {
    if (!req.session.guildId) return res.status(401).json({ error: "로그인이 필요합니다." });

    const { embed } = req.body;
    const guildId = req.session.guildId;

    if (!embed) return res.status(400).json({ error: "embed 데이터는 필수입니다." });

    const config = loadConfig();
    ensureServerConfig(config, guildId);

    config.servers[guildId].embed = embed;
    saveConfig(config);

    res.json({ success: true, config: config.servers[guildId] });
});

// 공지 저장
app.post("/api/ticket-config/notice", (req, res) => {
    if (!req.session.guildId) return res.status(401).json({ error: "로그인이 필요합니다." });

    const { notice } = req.body;
    const guildId = req.session.guildId;

    if (!notice) return res.status(400).json({ error: "notice 데이터는 필수입니다." });

    const config = loadConfig();
    ensureServerConfig(config, guildId);

    config.servers[guildId].notice = notice;
    saveConfig(config);

    res.json({ success: true, config: config.servers[guildId] });
});

// 제목 저장
app.post("/api/ticket-config/title", (req, res) => {
    if (!req.session.guildId) return res.status(401).json({ error: "로그인이 필요합니다." });

    const { title } = req.body;
    const guildId = req.session.guildId;

    if (!title) return res.status(400).json({ error: "title 데이터는 필수입니다." });

    const config = loadConfig();
    ensureServerConfig(config, guildId);

    config.servers[guildId].title = title;
    saveConfig(config);

    res.json({ success: true, config: config.servers[guildId] });
});

// ========== 서버 실행 ==========
app.listen(3000, () => {
    console.log("✅ 서버 실행 중: https://okinawadash.onrender.com");
});