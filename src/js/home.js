(function () {
    const encChip = document.getElementById('encChip');

    fetch('/api/info', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(info => {
            document.querySelectorAll('[data-version]').forEach(el => {
                el.textContent = 'v' + info.version;
            });
            if (!encChip) return;
            if (info.encryption) {
                encChip.classList.add('ok');
                encChip.textContent = 'Login encryption on';
            } else {
                encChip.classList.add('warn');
                encChip.textContent = 'Encryption off: set CONFIG_SECRET (16+ characters) on the server';
            }
        })
        .catch(() => {
            if (encChip) encChip.classList.add('hidden');
        });
})();
