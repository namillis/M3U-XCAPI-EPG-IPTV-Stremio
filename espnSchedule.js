const fetch = require('node-fetch');

const LEAGUES = [
    ['football/college-football', 'College Football'],
    ['football/nfl', 'NFL'],
    ['basketball/nba', 'NBA'],
    ['basketball/wnba', 'WNBA'],
    ['basketball/mens-college-basketball', "Men's College Basketball"],
    ['basketball/womens-college-basketball', "Women's College Basketball"],
    ['baseball/mlb', 'MLB'],
    ['baseball/college-baseball', 'College Baseball'],
    ['hockey/nhl', 'NHL'],
    ['hockey/mens-college-hockey', "Men's College Hockey"],
    ['hockey/womens-college-hockey', "Women's College Hockey"],
    ['soccer/usa.1', 'MLS'],
    ['soccer/usa.nwsl', 'NWSL'],
    ['soccer/usa.ncaa.m.1', "Men's College Soccer"],
    ['soccer/usa.ncaa.w.1', "Women's College Soccer"],
    ['soccer/eng.1', 'Premier League'],
    ['soccer/eng.2', 'EFL Championship'],
    ['soccer/esp.1', 'LaLiga'],
    ['soccer/esp.2', 'LaLiga 2'],
    ['soccer/ita.1', 'Serie A'],
    ['soccer/ger.1', 'Bundesliga'],
    ['soccer/fra.1', 'Ligue 1'],
    ['soccer/uefa.champions', 'Champions League'],
    ['soccer/uefa.europa', 'Europa League'],
    ['soccer/uefa.nations', 'UEFA Nations League'],
    ['soccer/concacaf.nations.league', 'CONCACAF Nations League'],
    ['soccer/mex.1', 'Liga MX'],
    ['volleyball/womens-college-volleyball', "Women's College Volleyball"],
    ['field-hockey/womens-college-field-hockey', 'College Field Hockey'],
    ['lacrosse/mens-college-lacrosse', "Men's College Lacrosse"],
    ['lacrosse/womens-college-lacrosse', "Women's College Lacrosse"]
];
const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/';
const REFRESH_MS = 15 * 60000;
const RETRY_MS = 2 * 60000;
const TIMEOUT_MS = 8000;
const CONCURRENCY = 6;
const EARLY_HOURS = 6;

const state = { games: [], version: 0, at: 0, failedAt: 0, loading: null };

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });

function etDate(ms) {
    return dateFmt.format(new Date(ms)).replace(/-/g, '');
}

function teamNames(team) {
    return [team.location, team.displayName, team.shortDisplayName, team.abbreviation].filter(Boolean);
}

function parseScoreboard(json, sport) {
    const games = [];
    for (const ev of json?.events || []) {
        const comp = ev.competitions?.[0];
        const competitors = (comp?.competitors || []).filter(c => c.team);
        if (competitors.length !== 2) continue;
        const start = Date.parse(ev.date);
        if (!Number.isFinite(start)) continue;
        const away = competitors.find(c => c.homeAway === 'away') || competitors[0];
        const home = competitors.find(c => c !== away) || competitors[1];
        const networks = [...new Set([
            ...(comp.geoBroadcasts || []).map(g => g.media?.shortName),
            ...(comp.broadcasts || []).flatMap(b => b.names || [])
        ].filter(Boolean))];
        const type = ev.status?.type || {};
        games.push({
            sport,
            start,
            teams: [teamNames(away.team), teamNames(home.team)],
            label: `${away.team.displayName || away.team.location} @ ${home.team.displayName || home.team.location}`,
            networks,
            color: home.team.color || away.team.color || null,
            altColor: home.team.alternateColor || away.team.alternateColor || null,
            state: type.state || 'pre',
            detail: type.shortDetail || ''
        });
    }
    return games;
}

async function fetchJson(url) {
    const res = await fetch(url, { timeout: TIMEOUT_MS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function refresh(now) {
    const dates = [etDate(now)];
    if (parseInt(hourFmt.format(new Date(now)), 10) < EARLY_HOURS) dates.unshift(etDate(now - 86400000));
    const jobs = [];
    for (const [path, sport] of LEAGUES) {
        for (const d of dates) jobs.push({ url: `${BASE_URL}${path}/scoreboard?dates=${d}&limit=500`, sport });
    }
    const games = [];
    let loaded = 0;
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        const batch = await Promise.allSettled(
            jobs.slice(i, i + CONCURRENCY).map(j => fetchJson(j.url).then(json => parseScoreboard(json, j.sport)))
        );
        for (const r of batch) {
            if (r.status !== 'fulfilled') continue;
            loaded++;
            games.push(...r.value);
        }
    }
    if (!loaded) throw new Error('no scoreboards loaded');
    return games;
}

function getSchedule(now = Date.now()) {
    const stale = now - state.at > REFRESH_MS && now - state.failedAt > RETRY_MS;
    if (stale && !state.loading) {
        state.loading = refresh(now)
            .then(games => {
                state.games = games;
                state.at = Date.now();
                state.version++;
            })
            .catch(e => {
                state.failedAt = Date.now();
                console.warn('[ESPN] Schedule refresh failed:', e.message);
            })
            .finally(() => { state.loading = null; });
    }
    return state;
}

module.exports = { getSchedule, parseScoreboard, LEAGUES };
