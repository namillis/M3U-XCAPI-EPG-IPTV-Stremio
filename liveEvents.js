const crypto = require('crypto');

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const ZONES = { ET: 'America/New_York', UK: 'Europe/London' };
const DASH = '[-–—]';
const MON = '(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\\.?';
const TOKEN = `(?:${MON}\\s+(\\d{1,2})\\s*${DASH}\\s*)?(\\d{1,2}):(\\d{2})\\s*(AM|PM)\\s*(ET|UK)(?:\\s*\\(\\s*${MON}\\s+(\\d{1,2})\\s*\\))?`;
const TOKEN_GROUPS = 8;
const SCHEDULE_RE = new RegExp(`\\s*(?:${DASH}\\s*)?${TOKEN}(?:\\s*\\/\\s*${TOKEN})?\\s*$`, 'i');
const SLOT_SPLIT_RE = /\s:\s?|:\s/;
const WEEKDAY_TAGS = [[/\(TNF\)|THURSDAY NIGHT/i, 4], [/\(MNF\)|MONDAY NIGHT/i, 1], [/\(SNF\)|SUNDAY NIGHT/i, 0]];
const NOISE_PARENS = /\s*\((?:ESP|ESPAÑOL|ESPANOL|SPANISH|PORTUGUÊS|PORTUGUES|FRENCH|FRANÇAIS|ITALIANO|DEUTSCH|ENG|ENGLISH|UHD|FHD|HD|SD|4K|ALT|ALTERNATE)\)/gi;
const ACRONYMS = new Set(['UFC', 'NFL', 'NHL', 'NBA', 'MLB', 'MLS', 'WNBA', 'NCAA', 'NCAAF', 'NCAAB', 'ATP', 'WTA', 'PGA', 'LPGA', 'F1', 'F2', 'F3',
    'WRC', 'IMSA', 'UCI', 'AEW', 'WWE', 'PFL', 'BMX', 'MMA', 'PPV', 'TV', 'FC', 'SC', 'AFC', 'CF', 'KR', 'II', 'III', 'IV', 'US', 'USA', 'UK',
    'UEFA', 'FIFA', 'PDC', 'BKFC', 'MPC', 'VPRC', 'SNF', 'MNF', 'TNF', 'ODI', 'T20', 'NY', 'LA', 'PSG', 'RB', 'AC', 'CBS', 'ESPN', 'ESPN2', 'ESPNU', 'NJ',
    'UC', 'VCU', 'UCLA', 'USC', 'LSU', 'TCU', 'SMU', 'BYU', 'UCF', 'UNLV', 'UTEP', 'UTSA', 'FIU', 'FAU', 'UAB', 'UNC', 'NC', 'UIC', 'NJIT', 'SIU', 'UMBC', 'CSU', 'FGCU', 'SEC', 'ACC', 'AAC', 'MAC', 'CAA', 'NEC', 'SWAC', 'MEAC']);

const DEFAULT_DURATION_MS = 3 * 3600000;
const DURATIONS = [
    [/WEIGH-?IN|PRESS CONFERENCE|DESK SHOW|PRE-?SHOW|POST-?SHOW|STUDIO/i, 1.5 * 3600000],
    [/PRACTICE|QUALIFYING|SHOOTOUT/i, 1.5 * 3600000],
    [/GOLF|PGA|LPGA|FEATURED GROUPS|CHAMPIONSHIP .*ROUND|CRICKET|\bODI\b|\bTEST\b|T20|RACE|RALLY|GRAND PRIX|IMSA|NASCAR|INDYCAR/i, 5 * 3600000]
];
const SOON_MS = 60 * 60000;
const EARLY_MS = 15 * 60000;
const CARD_COLORS = ['1e3a8a', '7f1d1d', '14532d', '581c87', '78350f', '134e4a', '312e81', '831843'];
const CARD_LINE = 24;
const CARD_TEXT_MAX = 58;

const offsetCache = new Map();
function tzOffsetMs(zone, utcMs) {
    const key = zone + ':' + Math.floor(utcMs / 900000);
    let off = offsetCache.get(key);
    if (off === undefined) {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric'
        });
        const p = {};
        for (const { type, value } of fmt.formatToParts(new Date(utcMs))) p[type] = value;
        off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
        if (offsetCache.size > 2000) offsetCache.clear();
        offsetCache.set(key, off);
    }
    return off;
}

function zonedToUtc(zone, y, mo, d, h, mi) {
    const wall = Date.UTC(y, mo, d, h, mi, 0);
    let utc = wall - tzOffsetMs(zone, wall);
    return wall - tzOffsetMs(zone, utc);
}

function zonedParts(zone, utcMs) {
    const shifted = new Date(utcMs + tzOffsetMs(zone, utcMs));
    return { y: shifted.getUTCFullYear(), mo: shifted.getUTCMonth(), d: shifted.getUTCDate(), wd: shifted.getUTCDay() };
}

function to24(h, ap) {
    h = parseInt(h, 10) % 12;
    return ap.toUpperCase() === 'PM' ? h + 12 : h;
}

function readToken(m, i) {
    if (!m[i + 2]) return null;
    const mon = m[i] || m[i + 6];
    const day = m[i] ? m[i + 1] : m[i + 7];
    return {
        mon: mon ? MONTHS[mon.slice(0, 3).toUpperCase()] : null,
        day: day ? parseInt(day, 10) : null,
        h: to24(m[i + 2], m[i + 4]),
        mi: parseInt(m[i + 3], 10),
        zone: ZONES[m[i + 5].toUpperCase()]
    };
}

function datedInstant(tok, now) {
    const { y } = zonedParts(tok.zone, now);
    let best = null;
    for (const year of [y - 1, y, y + 1]) {
        const t = zonedToUtc(tok.zone, year, tok.mon, tok.day, tok.h, tok.mi);
        if (best === null || Math.abs(t - now) < Math.abs(best - now)) best = t;
    }
    return best;
}

function undatedInstant(tok, title, now) {
    const today = zonedParts(tok.zone, now);
    let target = null;
    for (const [re, wd] of WEEKDAY_TAGS) if (re.test(title)) target = wd;
    if (target === null && /\bNFL\b/i.test(title)) target = 0;
    let addDays = 0;
    if (target !== null) addDays = (target - today.wd + 7) % 7;
    return {
        start: zonedToUtc(tok.zone, today.y, today.mo, today.d + addDays, tok.h, tok.mi),
        inferred: target !== null
    };
}

function durationFor(title) {
    for (const [re, ms] of DURATIONS) if (re.test(title)) return ms;
    return DEFAULT_DURATION_MS;
}

function titleCase(s) {
    return s.toLowerCase().replace(/[\p{L}\p{N}][\p{L}\p{N}'’.+]*/gu, w => {
        const up = w.toUpperCase();
        if (ACRONYMS.has(up.replace(/[.'’]+$/, '')) || /\d/.test(w)) return up;
        return w.charAt(0).toUpperCase() + w.slice(1);
    });
}

function sourceLabel(group) {
    const parts = String(group || '').split('|').map(s => s.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : 'Live Event';
}

function parseEventSlot(name, now, hintText = '') {
    const parts = String(name || '').split(SLOT_SPLIT_RE);
    if (parts.length < 2) return null;
    const slot = parts[0].trim();
    const rest = parts.slice(1).join(': ').trim();
    if (!rest) return null;
    const m = rest.match(SCHEDULE_RE);
    if (!m) return null;
    const title = rest.slice(0, m.index).replace(/[\s\-–—]+$/, '').trim();
    if (!title) return null;
    const a = readToken(m, 1);
    const b = readToken(m, 1 + TOKEN_GROUPS);
    const toks = [a, b].filter(Boolean);
    const explicit = toks.filter(t => t.mon !== null && t.day !== null);
    const pick = explicit.find(t => t.zone === ZONES.ET) || explicit[0];
    let start;
    let day = 'dated';
    if (pick) {
        start = datedInstant(pick, now);
    } else {
        const et = toks.find(t => t.zone === ZONES.ET) || toks[0];
        const undated = undatedInstant(et, `${title} ${hintText}`, now);
        start = undated.start;
        day = undated.inferred ? 'inferred' : 'assumed';
    }
    return { slot, title, start, end: start + durationFor(title), day };
}

function wrapLines(text, width) {
    const lines = [];
    let line = '';
    for (const word of text.replace(/ +([–—-]) +/g, '\u00a0$1 ').split(/ +/).filter(Boolean)) {
        if (line && line.length + 1 + word.length > width) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function cardText(title) {
    const words = title.split(/ +/).filter(Boolean);
    let text = wrapLines(title, CARD_LINE).join('\\n');
    while (text.length > CARD_TEXT_MAX && words.length > 1) {
        words.pop();
        text = wrapLines(words.join(' ') + '…', CARD_LINE).join('\\n');
    }
    return text.slice(0, CARD_TEXT_MAX).replace(/\\+$/, '');
}

function eventCardUrl(e) {
    const source = e.sources[0] || '';
    const color = CARD_COLORS[parseInt(crypto.createHash('md5').update(source).digest('hex').slice(0, 6), 16) % CARD_COLORS.length];
    let text = cardText(e.title);
    if (source && text.length + 2 + source.length <= CARD_TEXT_MAX) text += `\\n${source}`;
    return `https://placehold.co/640x360/${color}/FFFFFF/png?font=oswald&text=${encodeURIComponent(text)}`;
}

function eventKey(title, start) {
    const t = title.toUpperCase().replace(NOISE_PARENS, '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    return `${t}|${Math.round(start / 300000)}`;
}

function buildEventIndex(channels, { now = Date.now(), groupOf = c => c.category || c.attributes?.['group-title'] } = {}) {
    const byKey = new Map();
    for (const c of channels) {
        if (!c || c.type !== 'tv') continue;
        const group = groupOf(c) || '';
        const ev = parseEventSlot(c.name, now, group);
        if (!ev) continue;
        const key = eventKey(ev.title, ev.start);
        let entry = byKey.get(key);
        if (!entry) {
            entry = {
                id: 'iptv_ev_' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 16),
                title: titleCase(ev.title.replace(NOISE_PARENS, '').trim()),
                start: ev.start,
                end: ev.end,
                assumedDay: ev.day === 'assumed',
                sources: [],
                channels: []
            };
            byKey.set(key, entry);
        }
        if (ev.day !== 'assumed') entry.assumedDay = false;
        const src = sourceLabel(group);
        if (!entry.sources.includes(src)) entry.sources.push(src);
        entry.channels.push({ id: c.id, slot: ev.slot, source: src, logo: c.logo || c.attributes?.['tvg-logo'] || null });
    }
    const byId = new Map();
    for (const e of byKey.values()) byId.set(e.id, e);
    return byId;
}

function eventState(e, now = Date.now()) {
    if (now >= e.start - EARLY_MS && now < e.end) return now < e.start ? 'soon' : 'live';
    if (now < e.start && e.start - now <= SOON_MS) return 'soon';
    return null;
}

function currentEvents(index, now = Date.now(), { source = null, includeAssumed = false } = {}) {
    const live = [];
    const soon = [];
    for (const e of index.values()) {
        if (source ? !e.sources.includes(source) : (e.assumedDay && !includeAssumed)) continue;
        const s = eventState(e, now);
        if (s === 'live') live.push(e);
        else if (s === 'soon') soon.push(e);
    }
    live.sort((a, b) => b.start - a.start || a.title.localeCompare(b.title));
    soon.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
    return [...live, ...soon];
}

module.exports = { parseEventSlot, buildEventIndex, currentEvents, eventState, eventCardUrl, titleCase, sourceLabel };
