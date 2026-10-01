// Shared overlay & manifest polling logic (enhanced + strict disabling of action buttons until manifest ready)
(function () {
    const overlay         = document.getElementById('loaderOverlay');
    const progressBar     = document.getElementById('progressBar');
    const progressText    = document.getElementById('progressText');
    const loaderMessage   = document.getElementById('loaderMessage');
    const statusDetails   = document.getElementById('statusDetails');
    const copyBtn         = document.getElementById('copyManifestBtn');
    const openBtn         = document.getElementById('openStremioBtn');
    const manifestRow     = document.getElementById('manifestRow');
    const manifestField   = document.getElementById('manifestUrlField');
    const closeBtn        = document.getElementById('overlayCloseBtn');

    if (closeBtn) closeBtn.addEventListener('click', () => hideOverlay());
    if (manifestField) manifestField.addEventListener('focus', () => manifestField.select());

    const groupCatToggle = document.getElementById('groupCatalogs');
    const groupFilterRow = document.getElementById('groupFilterGroup');
    function syncGroupFilter() {
        if (groupCatToggle && groupFilterRow)
            groupFilterRow.classList.toggle('hidden', !groupCatToggle.checked);
    }
    if (groupCatToggle) groupCatToggle.addEventListener('change', syncGroupFilter);
    syncGroupFilter();

    function openAdvancedIfUsed() {
        document.querySelectorAll('details.advanced').forEach(d => {
            const used = [...d.querySelectorAll('input')].some(i =>
                i.type === 'checkbox' ? i.checked : i.value.trim() !== '' && i.value.trim() !== '0');
            if (used) d.open = true;
        });
    }

    fetch('/api/info', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(info => {
            if (!info || !info.version) return;
            document.querySelectorAll('[data-version]').forEach(el => { el.textContent = 'v' + info.version; });
        })
        .catch(() => {});

    // Polling / timing constants
    const POLL_INTERVAL_MS     = 1500;
    const MAX_WAIT_MS          = 90000;
    const PROGRESS_ESTIMATE_MS = 45000;

    let pollTimer      = null;
    let autoOpened     = false;
    let manifestUrl    = '';
    let stremioUrl     = '';
    let startTime      = 0;
    let manualPhase    = false;
    let baselinePct    = 0;
    let ready          = false;

    /* -------- Utility UI helpers -------- */

    function disableActionButtons() {
        if (openBtn) {
            openBtn.disabled = true;
            openBtn.classList.add('locked');
            openBtn.style.display = 'none'; // HIDE until ready

        }
        if (copyBtn) {
            copyBtn.disabled = true;
            copyBtn.classList.add('locked');
            copyBtn.style.display = 'none'; // HIDE until ready
        }
        if (manifestRow) manifestRow.classList.add('hidden');
    }

    function enableActionButtons() {
        if (openBtn) {
            openBtn.disabled = false;
            openBtn.classList.remove('locked');
            openBtn.style.display = ''; // SHOW when ready
        }
        if (copyBtn) {
            copyBtn.disabled = false;
            copyBtn.classList.remove('locked');
            copyBtn.style.display = ''; // SHOW when ready
        }
        if (manifestRow && manifestUrl) manifestRow.classList.remove('hidden');
    }

    function showOverlay(isManualPrePhase = false) {
        manualPhase = isManualPrePhase;
        if (overlay) overlay.classList.remove('hidden');
        setProgress(0, 'Initializing…');
        statusDetails && (statusDetails.textContent = '');
        autoOpened = false;
        ready = false;
        disableActionButtons(); // ALWAYS ensure disabled on open
    }

    function hideOverlay() {
        if (overlay) overlay.classList.add('hidden');
        if (pollTimer) clearTimeout(pollTimer);
    }

    function setProgress(pct, label) {
        if (progressBar) progressBar.style.width = Math.min(100, pct) + '%';
        if (progressText) progressText.textContent = `${Math.round(pct)}%`;
        if (label) loaderMessage.textContent = label;
    }

    function appendDetail(line) {
        if (!statusDetails) return;
        statusDetails.textContent += (statusDetails.textContent ? '\n' : '') + line;
        statusDetails.scrollTop = statusDetails.scrollHeight;
    }

    function progressMessage(elapsed) {
        if (elapsed < 4000)  return 'Downloading playlist…';
        if (elapsed < 10000) return 'Parsing channels…';
        if (elapsed < 18000) return 'Grouping / movies…';
        if (elapsed < 26000) return 'Fetching EPG (if enabled)…';
        if (elapsed < 35000) return 'Parsing EPG data…';
        if (elapsed < 45000) return 'Finalizing manifest…';
        return 'Almost done…';
    }

    /* -------- Polling logic -------- */

    function attemptPoll() {
        if (manualPhase) return; // Pre-flight still running client-side
        if (ready) return;

        const elapsed = Date.now() - startTime;

        // Synthetic progress up to baseline + 95%
        if (progressBar && parseFloat(progressBar.style.width) < baselinePct + 95) {
            const synthetic = baselinePct + Math.min(95, (elapsed / PROGRESS_ESTIMATE_MS) * 95);
            setProgress(synthetic, progressMessage(elapsed));
        }

        fetch(manifestUrl + '?_=' + Date.now(), { cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(json => {
                if (json && json.id) {
                    ready = true;
                    setProgress(100, 'Ready');
                    appendDetail('Manifest ready.');
                    enableActionButtons(); // ENABLE ONLY HERE
                    if (!autoOpened) {
                        autoOpened = true;
                        // Do not force-open if user might want to copy first.
                        // To auto-open uncomment next line:
                        // window.location.href = stremioUrl;
                    }
                    if (pollTimer) clearTimeout(pollTimer);
                    return;
                }
                scheduleNext(elapsed);
            })
            .catch(() => scheduleNext(elapsed));
    }

    function scheduleNext(elapsed) {
        if (ready) return;
        if (elapsed > MAX_WAIT_MS) {
            loaderMessage.textContent = 'Taking longer than expected.';
            appendDetail('Timeout waiting for manifest. You may retry or open later.');
            setProgress(100, 'Timeout');
            // Still allow user to copy / open after timeout
            enableActionButtons();
            return;
        }
        pollTimer = setTimeout(attemptPoll, POLL_INTERVAL_MS);
    }

    function startPolling(startPct = 50) {
        baselinePct = startPct;
        manualPhase = false;
        startTime = Date.now();
        disableActionButtons(); // Ensure still disabled when entering polling
        attemptPoll();
    }

    /* -------- Clipboard / events -------- */

    function copyManifest() {
        if (!manifestUrl || copyBtn.disabled) return;
        navigator.clipboard.writeText(manifestUrl)
            .then(() => {
                const old = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = old, 1600);
            })
            .catch(() => {
                const old = copyBtn.textContent;
                copyBtn.textContent = 'Copy Failed';
                setTimeout(() => copyBtn.textContent = old, 1600);
            });
    }

    function openInStremio() {
        if (!stremioUrl || openBtn.disabled) return;
        window.location.href = stremioUrl;
    }

    if (copyBtn) copyBtn.addEventListener('click', copyManifest);
    if (openBtn) openBtn.addEventListener('click', openInStremio);

    /* -------- Token / URL builder -------- */

    function encodeConfigBase64Url(config) {
        const json = JSON.stringify(config);
        let b64 = btoa(unescape(encodeURIComponent(json)));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    async function encryptedToken(config) {
        try {
            const res = await fetch('/encrypt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!res.ok) return null;
            const { token } = await res.json();
            return typeof token === 'string' && token.startsWith('enc:') ? token : null;
        } catch {
            return null;
        }
    }

    async function buildUrls(config) {
        let token = await encryptedToken(config);
        if (token) {
            appendDetail('✔ Config encrypted (CONFIG_SECRET)');
        } else {
            token = encodeConfigBase64Url(config);
            appendDetail('⚠ Server encryption unavailable (set CONFIG_SECRET) – using plain token');
        }
        const origin = window.location.origin;
        manifestUrl = `${origin}/${token}/manifest.json`;
        const hostPart = origin.replace(/^https?:\/\//, '');
        stremioUrl = `stremio://${hostPart}/${token}/manifest.json`;
        if (manifestField) manifestField.value = manifestUrl;
        return { token, manifestUrl, stremioUrl };
    }

    /* -------- Reconfigure prefill -------- */

    function reconfigureToken() {
        const m = window.location.pathname.match(/^\/([^/]+)\/configure-(direct|xtream)\/?$/);
        return m ? m[1] : null;
    }

    function setField(id, value) {
        const el = document.getElementById(id);
        if (!el || value === undefined || value === null) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = String(value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function prefillIfReconfigure(mode) {
        const token = reconfigureToken();
        if (!token) return null;
        let cfg;
        try {
            const res = await fetch(`/${token}/configure-data.json`, { cache: 'no-store' });
            if (!res.ok) return null;
            cfg = await res.json();
        } catch {
            return null;
        }
        if (mode === 'xtream') {
            setField('xtreamUrl', cfg.xtreamUrl);
            setField('xtreamUsername', cfg.xtreamUsername);
            setField('xtreamPassword', cfg.xtreamPassword);
            setField('xtreamUseM3U', !!cfg.xtreamUseM3U);
            setField('xtreamOutput', cfg.xtreamOutput);
            const epgMode = cfg.epgUrl ? 'custom' : 'xtream';
            const radio = document.querySelector(`input[name="epgMode"][value="${epgMode}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
            setField('customEpgUrl', cfg.epgUrl);
        } else {
            setField('m3uUrl', cfg.m3uUrl);
            setField('epgUrl', cfg.epgUrl);
        }
        setField('enableEpg', cfg.enableEpg !== false);
        setField('epgOffsetHours', cfg.epgOffsetHours || '');
        if (cfg.epgTimezone) setField('epgTimezone', cfg.epgTimezone);
        setField('epgLocalTimes', !!cfg.epgLocalTimes);
        setField('liveOnly', !!cfg.liveOnly);
        setField('groupCatalogs', !!cfg.groupCatalogs);
        setField('groupFilter', cfg.groupFilter || '');
        setField('debugMode', !!cfg.debug);
        openAdvancedIfUsed();
        return cfg;
    }

    /* -------- Public API -------- */

    window.ConfigureCommon = {
        showOverlay,
        hideOverlay,
        startPolling,
        buildUrls,
        prefillIfReconfigure,
        overlaySetMessage(msg) { loaderMessage.textContent = msg; },
        setProgress,
        appendDetail,
        // For direct-config pre-flight to re-disable if needed
        forceDisableActions: disableActionButtons
    };
})();