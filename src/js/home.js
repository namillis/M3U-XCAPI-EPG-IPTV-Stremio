(function () {
    const encChip = document.getElementById('encChip');
    const pwChip = document.getElementById('pwChip');
    const redisChip = document.getElementById('redisChip');

    function setChip(el, state, text) {
        if (!el) return;
        el.classList.remove('hidden', 'ok', 'warn');
        if (state) el.classList.add(state);
        el.textContent = text;
    }

    const REDIS_TEXT = {
        connected: ['ok', 'Redis cache connected'],
        connecting: ['warn', 'Redis cache connecting…'],
        error: ['warn', 'Redis cache error: check REDIS_URL'],
        off: ['', 'Redis cache off (memory only)']
    };

    fetch('/api/info', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(info => {
            document.querySelectorAll('[data-version]').forEach(el => {
                el.textContent = 'v' + info.version;
            });
            if (info.encryption) setChip(encChip, 'ok', 'Login encryption on');
            else setChip(encChip, 'warn', 'Encryption off: set CONFIG_SECRET (16+ characters) on the server');
            if (info.sitePassword) setChip(pwChip, 'ok', 'Site password on');
            else setChip(pwChip, 'warn', 'No site password: set SITE_PASSWORD on the server');
            const [state, text] = REDIS_TEXT[info.redis] || REDIS_TEXT.off;
            setChip(redisChip, state, text);
        })
        .catch(() => {
            if (encChip) encChip.classList.add('hidden');
        });
})();
