const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

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

// webaccounts.json 경로 (Render 서버에서 직접 관리)
const WEB_ACCOUNTS_FILE = path.join(__dirname, "data/webaccounts.json");

// 계정 불러오기
function loadWebAccounts() {
    if (fs.existsSync(WEB_ACCOUNTS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(WEB_ACCOUNTS_FILE, "utf8"));
        } catch (err) {
            console.error("❌ webaccounts.json 로드 실패:", err.message);
            return {};
        }
    }
    return {};
}

// ========== 기본 페이지 ==========
app.get("/", (req, res) => {
    if (req.session.guildId) {
        return res.redirect("/success");
    }
    res.sendFile(path.join(__dirname, "views", "index.html"));
});

// ========== WebAccount (아이디/비번) 로그인 ==========
app.post("/local-login", (req, res) => {
    const { username, password } = req.body;

    const accounts = loadWebAccounts();

    const account = Object.values(accounts).find(
        acc => acc.username === username && acc.password === password
    );

    if (!account) {
        return res.status(401).send(`
            <html>
                <head>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <title>로그인 실패</title>
                </head>
                <body class="bg-black text-white h-screen flex items-center justify-center">
                    <div class="text-center">
                        <h1 class="text-2xl font-bold mb-4">로그인 실패</h1>
                        <p class="mb-4">아이디 또는 비밀번호가 잘못되었습니다.</p>
                        <a href="/" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">다시 로그인</a>
                    </div>
                </body>
            </html>
        `);
    }

    // ✅ 로그인 성공 → 세션에 저장 (서버 이름도 포함)
    req.session.guildId = account.guildId;
    req.session.username = account.username;
    req.session.serverName = account.serverName; // 서버 이름 추가

    res.redirect("/success");
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

// ========== 세션 정보 API (success.html에서 서버 이름 가져오기) ==========
app.get("/api/session-info", (req, res) => {
    if (!req.session.guildId) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    res.json({
        guildId: req.session.guildId,
        username: req.session.username,
        serverName: req.session.serverName || "Unknown Server"
    });
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
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
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
            title: {},
            gif: {}
        };
    }
}

// 현재 서버 설정 가져오기
app.get("/api/ticket-config", (req, res) => {
    if (!req.session.guildId) return res.status(401).json({ error: "로그인이 필요합니다." });

    const guildId = req.session.guildId;
    const config = loadConfig();
    ensureServerConfig(config, guildId);

    res.json({ success: true, config: config.servers[guildId] });
});

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

// 버튼 삭제
app.delete("/api/ticket-config/button/:buttonId", (req, res) => {
    if (!req.session.guildId) return res.status(401).json({ error: "로그인이 필요합니다." });

    const { buttonId } = req.params;
    const guildId = req.session.guildId;

    const config = loadConfig();
    ensureServerConfig(config, guildId);

    config.servers[guildId].buttons = config.servers[guildId].buttons.filter(b => b.id !== buttonId);

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

// GIF 저장
app.post("/api/ticket-config/gif", (req, res) => {
    if (!req.session.guildId) return res.status(401).json({ error: "로그인이 필요합니다." });

    const { gif } = req.body;
    const guildId = req.session.guildId;

    if (!gif) return res.status(400).json({ error: "gif 데이터는 필수입니다." });

    const config = loadConfig();
    ensureServerConfig(config, guildId);

    config.servers[guildId].gif = gif;
    saveConfig(config);

    res.json({ success: true, config: config.servers[guildId] });
});

// ========== 서버 실행 ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
