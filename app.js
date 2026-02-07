(() => {
    const LS_CFG = "dndcanvas_cfg_v1";
    const LS_TOKEN = "dndcanvas_token_v1";
    const LS_DM = "dndcanvas_dm_v1";

    const elStage = document.getElementById("stage");
    const elBg = document.getElementById("bg");
    const elLayer = document.getElementById("layer");
    const elCaptions = document.getElementById("captions");
    const elTopHint = document.getElementById("topHint");

    const elDmBar = document.getElementById("dmBar");
    const elDmConfig = document.getElementById("dmConfig");

    const btnConfig = document.getElementById("btnConfig");
    const btnToken = document.getElementById("btnToken");
    const btnSave = document.getElementById("btnSave");
    const btnExitDm = document.getElementById("btnExitDm");

    const btnCaptions = document.getElementById("btnCaptions");
    const btnBringFront = document.getElementById("btnBringFront");
    const btnSendBack = document.getElementById("btnSendBack");
    const btnDelete = document.getElementById("btnDelete");

    const fileBg = document.getElementById("fileBg");
    const fileFg = document.getElementById("fileFg");

    const cfgOwner = document.getElementById("cfgOwner");
    const cfgRepo = document.getElementById("cfgRepo");
    const cfgBranch = document.getElementById("cfgBranch");
    const cfgPoll = document.getElementById("cfgPoll");
    const btnCfgApply = document.getElementById("btnCfgApply");
    const btnCfgClose = document.getElementById("btnCfgClose");

    const elCaptionModal = document.getElementById("captionModal");
    const elCaptionText = document.getElementById("captionText");
    const btnCapApply = document.getElementById("btnCapApply");
    const btnCapClose = document.getElementById("btnCapClose");

    const DEFAULT_POLL_MS = 1500;

    const state = {
        data: null,
        lastUpdatedAt: null,
        selectedId: null,
        dm: false,
        dragging: null
    };

    function nowIso() {
        return new Date().toISOString();
    }

    function randId() {
        return Math.random().toString(16).slice(2) + Date.now().toString(16);
    }

    function sanitizeName(name) {
        return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
    }

    function parsePagesRepo() {
        const host = window.location.hostname;
        const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
        if (!host.endsWith(".github.io")) return null;

        const owner = host.split(".")[0];
        const parts = path.split("/").filter(Boolean);
        const repo = parts.length ? parts[0] : `${owner}.github.io`;
        return { owner, repo };
    }

    function loadCfg() {
        const saved = localStorage.getItem(LS_CFG);
        let cfg = saved ? safeJson(saved) : null;

        const pages = parsePagesRepo();
        if (!cfg) {
            cfg = {
                owner: pages ? pages.owner : "",
                repo: pages ? pages.repo : "",
                branch: "main",
                pollMs: DEFAULT_POLL_MS
            };
        }

        cfg.owner = cfg.owner || (pages ? pages.owner : "");
        cfg.repo = cfg.repo || (pages ? pages.repo : "");
        cfg.branch = cfg.branch || "main";
        cfg.pollMs = Number(cfg.pollMs || DEFAULT_POLL_MS);

        return cfg;
    }

    function saveCfg(cfg) {
        localStorage.setItem(LS_CFG, JSON.stringify(cfg));
    }

    function safeJson(s) {
        try { return JSON.parse(s); } catch { return null; }
    }

    function rawBase(cfg) {
        if (!cfg.owner || !cfg.repo || !cfg.branch) return null;
        return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}`;
    }

    function ghApiBase(cfg) {
        return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents`;
    }

    function setHint(msg, ms = 2200) {
        elTopHint.textContent = msg;
        elTopHint.classList.remove("hidden");
        window.clearTimeout(setHint._t);
        setHint._t = window.setTimeout(() => elTopHint.classList.add("hidden"), ms);
    }

    function setDm(on) {
        state.dm = !!on;
        localStorage.setItem(LS_DM, state.dm ? "1" : "0");
        elDmBar.classList.toggle("hidden", !state.dm);
        if (!state.dm) {
            state.selectedId = null;
            renderSelection();
        }
    }

    function askDmUnlock() {
        const code = window.prompt("DM code:");
        if (code === "dmadmin") {
            setDm(true);
            setHint("DM mode enabled");
        } else if (code != null) {
            setHint("Invalid code");
        }
    }

    function loadToken() {
        return localStorage.getItem(LS_TOKEN) || "";
    }

    function setToken(token) {
        if (!token) {
            localStorage.removeItem(LS_TOKEN);
            return;
        }
        localStorage.setItem(LS_TOKEN, token);
    }

    function buildAssetUrl(cfg, relPath, updatedAt) {
        const base = rawBase(cfg);
        if (!base || !relPath) return "";
        const v = encodeURIComponent(updatedAt || "");
        return `${base}/${relPath}?v=${v}`;
    }

    function applyBgFit(fit) {
        elBg.style.objectFit = (fit === "contain") ? "contain" : "cover";
    }

    function renderAll() {
        const cfg = loadCfg();
        const d = state.data;
        if (!d) return;

        const updatedAt = d.updatedAt || "";
        const bgSrc = d.background?.src ? buildAssetUrl(cfg, d.background.src, updatedAt) : "";
        elBg.src = bgSrc;
        applyBgFit(d.background?.fit || "cover");

        elLayer.innerHTML = "";
        const items = Array.isArray(d.items) ? d.items.slice() : [];
        items.sort((a, b) => (a.z || 0) - (b.z || 0));

        for (const it of items) {
            const div = document.createElement("div");
            div.className = "item";
            div.dataset.id = it.id;

            div.style.left = `${it.x || 0}px`;
            div.style.top = `${it.y || 0}px`;
            div.style.width = `${Math.max(10, it.w || 80)}px`;
            div.style.height = `${Math.max(10, it.h || 80)}px`;
            div.style.zIndex = String(it.z || 0);
            div.style.opacity = String(it.opacity ?? 1);
            const rot = Number(it.rot || 0);
            div.style.transform = `rotate(${rot}deg)`;

            const img = document.createElement("img");
            img.alt = "";
            img.draggable = false;
            img.src = buildAssetUrl(cfg, it.src, updatedAt);
            div.appendChild(img);

            if (state.dm) {
                const handle = document.createElement("div");
                handle.className = "handle";
                handle.title = "Resize";
                div.appendChild(handle);

                div.addEventListener("pointerdown", (ev) => onItemPointerDown(ev, it.id));
            }

            elLayer.appendChild(div);
        }

        renderSelection();
        renderCaptions();
    }

    function renderSelection() {
        const els = elLayer.querySelectorAll(".item");
        for (const e of els) {
            e.classList.toggle("selected", state.dm && e.dataset.id === state.selectedId);
        }
    }

    function renderCaptions() {
        const d = state.data;
        elCaptions.innerHTML = "";
        if (!d || !Array.isArray(d.items)) return;

        const caps = [];
        for (const it of d.items) {
            const arr = Array.isArray(it.captions) ? it.captions : [];
            for (const line of arr) {
                const s = String(line || "").trim();
                if (s) caps.push(s);
            }
        }

        if (!caps.length) return;

        for (const c of caps) {
            const div = document.createElement("div");
            div.className = "cap";
            div.textContent = c;
            elCaptions.appendChild(div);
        }
    }

    function findItem(id) {
        const d = state.data;
        if (!d || !Array.isArray(d.items)) return null;
        return d.items.find(x => x.id === id) || null;
    }

    function maxZ() {
        const d = state.data;
        if (!d || !Array.isArray(d.items) || !d.items.length) return 0;
        return Math.max(...d.items.map(x => Number(x.z || 0)));
    }

    function minZ() {
        const d = state.data;
        if (!d || !Array.isArray(d.items) || !d.items.length) return 0;
        return Math.min(...d.items.map(x => Number(x.z || 0)));
    }

    function onItemPointerDown(ev, id) {
        if (!state.dm) return;

        const target = ev.target;
        const itemEl = ev.currentTarget;
        state.selectedId = id;
        renderSelection();

        const it = findItem(id);
        if (!it) return;

        const rect = itemEl.getBoundingClientRect();
        const isHandle = target.classList.contains("handle");
        const isShiftResize = ev.shiftKey;

        const start = {
            id,
            pointerId: ev.pointerId,
            mode: (isHandle || isShiftResize) ? "resize" : "drag",
            startX: ev.clientX,
            startY: ev.clientY,
            x: Number(it.x || 0),
            y: Number(it.y || 0),
            w: Number(it.w || rect.width),
            h: Number(it.h || rect.height)
        };

        state.dragging = start;
        itemEl.setPointerCapture(ev.pointerId);
        itemEl.addEventListener("pointermove", onItemPointerMove);
        itemEl.addEventListener("pointerup", onItemPointerUp);
        itemEl.addEventListener("pointercancel", onItemPointerUp);
    }

    function onItemPointerMove(ev) {
        const drag = state.dragging;
        if (!drag || ev.pointerId !== drag.pointerId) return;

        const dx = ev.clientX - drag.startX;
        const dy = ev.clientY - drag.startY;

        const it = findItem(drag.id);
        if (!it) return;

        if (drag.mode === "drag") {
            it.x = Math.round(drag.x + dx);
            it.y = Math.round(drag.y + dy);
        } else {
            it.w = Math.round(Math.max(10, drag.w + dx));
            it.h = Math.round(Math.max(10, drag.h + dy));
        }

        renderAll();
    }

    function onItemPointerUp(ev) {
        const drag = state.dragging;
        if (!drag || ev.pointerId !== drag.pointerId) return;

        const itemEl = ev.currentTarget;
        state.dragging = null;

        itemEl.releasePointerCapture(ev.pointerId);
        itemEl.removeEventListener("pointermove", onItemPointerMove);
        itemEl.removeEventListener("pointerup", onItemPointerUp);
        itemEl.removeEventListener("pointercancel", onItemPointerUp);
    }

    async function fetchStateOnce() {
        const cfg = loadCfg();
        const base = rawBase(cfg);
        if (!base) {
            setHint("Config missing: owner/repo/branch");
            return;
        }

        const url = `${base}/state.json?ts=${Date.now()}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`state fetch failed: ${r.status}`);
        const json = await r.json();

        const updatedAt = json.updatedAt || null;
        const changed = updatedAt && updatedAt !== state.lastUpdatedAt;

        state.data = json;
        state.lastUpdatedAt = updatedAt;

        if (changed || !state.lastUpdatedAt) renderAll();
        if (!state.lastUpdatedAt) renderAll();
    }

    function startPolling() {
        const tick = async () => {
            if (document.hidden) return;
            try { await fetchStateOnce(); } catch { }
        };

        window.clearInterval(startPolling._t);
        const cfg = loadCfg();
        startPolling._t = window.setInterval(tick, cfg.pollMs || DEFAULT_POLL_MS);
        tick();
    }

    async function ghGetSha(cfg, path) {
        const token = loadToken();
        if (!token) throw new Error("No token");

        const url = `${ghApiBase(cfg)}/${encodeURIComponent(path)}?ref=${encodeURIComponent(cfg.branch)}`;
        const r = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });

        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`sha fetch failed: ${r.status}`);

        const j = await r.json();
        return j.sha || null;
    }

    async function ghPutFile(cfg, path, contentBase64, message) {
        const token = loadToken();
        if (!token) throw new Error("No token");

        const sha = await ghGetSha(cfg, path);

        const body = {
            message,
            content: contentBase64,
            branch: cfg.branch
        };
        if (sha) body.sha = sha;

        const url = `${ghApiBase(cfg)}/${encodeURIComponent(path)}`;
        const r = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!r.ok) {
            const t = await r.text().catch(() => "");
            throw new Error(`put failed: ${r.status} ${t}`);
        }
        return await r.json();
    }

    function readFileBase64(file) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error("FileReader error"));
            fr.onload = () => {
                const res = String(fr.result || "");
                const comma = res.indexOf(",");
                resolve(comma >= 0 ? res.slice(comma + 1) : res);
            };
            fr.readAsDataURL(file);
        });
    }

    async function uploadImageAndGetRelPath(file) {
        const cfg = loadCfg();
        if (!cfg.owner || !cfg.repo || !cfg.branch) throw new Error("Config missing");

        const base64 = await readFileBase64(file);
        const safe = sanitizeName(file.name || "image.png");
        const relPath = `assets/${Date.now()}_${safe}`;
        await ghPutFile(cfg, relPath, base64, `Upload ${relPath}`);
        return relPath;
    }

    async function saveState() {
        const cfg = loadCfg();
        if (!cfg.owner || !cfg.repo || !cfg.branch) throw new Error("Config missing");
        if (!loadToken()) throw new Error("No token");

        state.data.updatedAt = nowIso();
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(state.data, null, 2))));
        await ghPutFile(cfg, "state.json", content, "Update state");
        state.lastUpdatedAt = state.data.updatedAt;
        setHint("Saved");
    }

    function openCaptionModal() {
        if (!state.selectedId) {
            setHint("No item selected");
            return;
        }
        const it = findItem(state.selectedId);
        if (!it) return;

        const lines = (Array.isArray(it.captions) ? it.captions : [])
            .map(x => String(x || "").trim())
            .filter(Boolean);

        elCaptionText.value = lines.join("\n");
        elCaptionModal.classList.remove("hidden");
    }

    function closeCaptionModal() {
        elCaptionModal.classList.add("hidden");
    }

    function applyCaptions() {
        if (!state.selectedId) return;
        const it = findItem(state.selectedId);
        if (!it) return;

        const lines = String(elCaptionText.value || "")
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean);

        it.captions = lines;
        renderCaptions();
        closeCaptionModal();
    }

    function bringFront() {
        if (!state.selectedId) return;
        const it = findItem(state.selectedId);
        if (!it) return;
        it.z = maxZ() + 1;
        renderAll();
    }

    function sendBack() {
        if (!state.selectedId) return;
        const it = findItem(state.selectedId);
        if (!it) return;
        it.z = minZ() - 1;
        renderAll();
    }

    function deleteSelected() {
        if (!state.selectedId) return;
        const d = state.data;
        if (!d || !Array.isArray(d.items)) return;
        d.items = d.items.filter(x => x.id !== state.selectedId);
        state.selectedId = null;
        renderAll();
    }

    function ensureState() {
        if (!state.data) {
            state.data = { version: 1, updatedAt: nowIso(), background: { src: null, fit: "cover" }, items: [] };
            state.lastUpdatedAt = state.data.updatedAt;
        }
    }

    function wireUi() {
        document.addEventListener("keydown", (ev) => {
            if (ev.ctrlKey && ev.shiftKey && ev.code === "KeyD") {
                ev.preventDefault();
                if (!state.dm) askDmUnlock();
                else setDm(false);
            }
        });

        btnConfig.addEventListener("click", () => {
            elDmConfig.classList.toggle("hidden");
            const cfg = loadCfg();
            cfgOwner.value = cfg.owner || "";
            cfgRepo.value = cfg.repo || "";
            cfgBranch.value = cfg.branch || "";
            cfgPoll.value = String(cfg.pollMs || DEFAULT_POLL_MS);
        });

        btnCfgApply.addEventListener("click", () => {
            const cfg = loadCfg();
            cfg.owner = String(cfgOwner.value || "").trim();
            cfg.repo = String(cfgRepo.value || "").trim();
            cfg.branch = String(cfgBranch.value || "").trim() || "main";
            cfg.pollMs = Math.max(500, Number(cfgPoll.value || DEFAULT_POLL_MS));
            saveCfg(cfg);
            setHint("Config applied");
            startPolling();
            renderAll();
        });

        btnCfgClose.addEventListener("click", () => elDmConfig.classList.add("hidden"));

        btnToken.addEventListener("click", () => {
            const cur = loadToken();
            const t = window.prompt("GitHub token (fine-grained or classic). Stored locally in this browser.", cur || "");
            if (t === null) return;
            setToken(String(t).trim());
            setHint(loadToken() ? "Token set" : "Token cleared");
        });

        btnExitDm.addEventListener("click", () => setDm(false));

        fileBg.addEventListener("change", async () => {
            try {
                if (!state.dm) return;
                ensureState();
                const f = fileBg.files && fileBg.files[0];
                if (!f) return;
                const rel = await uploadImageAndGetRelPath(f);
                state.data.background = state.data.background || { src: null, fit: "cover" };
                state.data.background.src = rel;
                renderAll();
                setHint("Background uploaded (not saved state yet)");
            } catch (e) {
                setHint("Upload failed");
            } finally {
                fileBg.value = "";
            }
        });

        fileFg.addEventListener("change", async () => {
            try {
                if (!state.dm) return;
                ensureState();
                const f = fileFg.files && fileFg.files[0];
                if (!f) return;
                const rel = await uploadImageAndGetRelPath(f);

                const it = {
                    id: randId(),
                    src: rel,
                    x: 80,
                    y: 80,
                    w: 240,
                    h: 240,
                    z: maxZ() + 1,
                    rot: 0,
                    opacity: 1,
                    captions: []
                };

                state.data.items = Array.isArray(state.data.items) ? state.data.items : [];
                state.data.items.push(it);
                state.selectedId = it.id;
                renderAll();
                setHint("Foreground uploaded (not saved state yet)");
            } catch (e) {
                setHint("Upload failed");
            } finally {
                fileFg.value = "";
            }
        });

        btnCaptions.addEventListener("click", openCaptionModal);
        btnBringFront.addEventListener("click", bringFront);
        btnSendBack.addEventListener("click", sendBack);
        btnDelete.addEventListener("click", deleteSelected);

        btnSave.addEventListener("click", async () => {
            try {
                await saveState();
            } catch (e) {
                setHint("Save failed");
            }
        });

        btnCapApply.addEventListener("click", applyCaptions);
        btnCapClose.addEventListener("click", closeCaptionModal);

        elCaptionModal.addEventListener("click", (ev) => {
            if (ev.target === elCaptionModal) closeCaptionModal();
        });

        elStage.addEventListener("pointerdown", (ev) => {
            if (!state.dm) return;
            const t = ev.target;
            if (t === elStage || t === elBg || t === elLayer) {
                state.selectedId = null;
                renderSelection();
            }
        });

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) fetchStateOnce().catch(() => { });
        });
    }

    async function init() {
        wireUi();

        const dmSaved = localStorage.getItem(LS_DM) === "1";
        if (dmSaved) setDm(true);

        const cfg = loadCfg();
        if (!cfg.owner || !cfg.repo) {
            setHint("Ctrl+Shift+D -> DM -> Config: set owner/repo/branch");
        } else {
            setHint("Ctrl+Shift+D to enter DM mode");
        }

        startPolling();

        try { await fetchStateOnce(); } catch { }
    }

    init();
})();
