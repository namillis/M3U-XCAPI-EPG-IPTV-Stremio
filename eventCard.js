const path = require('path');
const fs = require('fs');

let sharp = null;
try {
    sharp = require('sharp');
    sharp.cache(false);
    sharp.concurrency(1);
} catch (e) {
    console.warn('[CARDS] sharp unavailable, using placeholder cards:', e.message);
}

const W = 640;
const H = 360;
const PHOTO_DIR = path.join(__dirname, 'src', 'img', 'sports');
const FONT_BOLD = path.join(__dirname, 'src', 'fonts', 'Oswald-Bold.ttf');
const FONT_SEMIBOLD = path.join(__dirname, 'src', 'fonts', 'Oswald-SemiBold.ttf');
const FONT_MEDIUM = path.join(__dirname, 'src', 'fonts', 'Oswald-Medium.ttf');
const DEFAULT_COLORS = {
    Football: '5b2c12', Basketball: '9a3412', Baseball: '1e3a8a', Hockey: '0f4c81', Soccer: '14532d',
    Volleyball: '7c2d92', 'Field Hockey': '0e7490', Lacrosse: '312e81', Tennis: '3f6212', Golf: '166534',
    Motorsport: '7f1d1d', Fighting: '991b1b', Wrestling: '581c87', Rugby: '134e4a', Cricket: '065f46',
    Darts: 'b91c1c', Snooker: '14532d', Cycling: 'a16207', 'Horse Racing': '78350f'
};
const FALLBACK_COLOR = '1f2937';
const SHADOW = 0.22;
const MID = 0.95;
const HIGHLIGHT = 0.42;
const TITLE_WIDTH = 560;
const TITLE_SIZES = [44, 38, 32];
const TITLE_MAX_HEIGHT = 200;

function photoFor(category) {
    if (!category) return null;
    const file = path.join(PHOTO_DIR, `${category.toLowerCase().replace(/\s+/g, '-')}.jpg`);
    return fs.existsSync(file) ? file : null;
}

function rgb(hex) {
    const n = parseInt(hex, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
}

function cardColor(e, category) {
    const team = [e.color, e.altColor].find(c => typeof c === 'string' && /^[0-9a-f]{6}$/i.test(c));
    return (team || DEFAULT_COLORS[category] || FALLBACK_COLOR).toLowerCase();
}

function escapeMarkup(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function textImage(text, { fontfile, font, color, width }) {
    const markup = `<span foreground="${color}">${escapeMarkup(text)}</span>`;
    const img = sharp({ text: { text: markup, font, fontfile, rgba: true, width, align: 'centre', wrap: 'word', dpi: 72 } });
    const buf = await img.png().toBuffer();
    const meta = await sharp(buf).metadata();
    return { buf, width: meta.width, height: meta.height };
}

async function background(photo, hex) {
    const c = rgb(hex);
    if (!photo) return sharp({ create: { width: W, height: H, channels: 3, background: { r: c[0], g: c[1], b: c[2] } } }).png().toBuffer();
    const dark = c.map(v => v * SHADOW);
    const mid = c.map(v => v * MID);
    const light = c.map(v => v + (255 - v) * HIGHLIGHT);
    const lut = new Uint8Array(256 * 3);
    for (let g = 0; g < 256; g++) {
        const [from, to, t] = g < 128 ? [dark, mid, g / 127] : [mid, light, (g - 128) / 127];
        for (let i = 0; i < 3; i++) lut[g * 3 + i] = Math.round(from[i] + (to[i] - from[i]) * t);
    }
    const { data, info } = await sharp(photo)
        .resize(W, H, { fit: 'cover' })
        .grayscale()
        .normalise()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height * 3);
    for (let p = 0, q = 0; p < data.length; p += info.channels, q += 3) {
        const g = data[p] * 3;
        out[q] = lut[g];
        out[q + 1] = lut[g + 1];
        out[q + 2] = lut[g + 2];
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
}

function overlaySvg(badgeWidth) {
    return Buffer.from(
        `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/>' +
        '</linearGradient></defs>' +
        `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
        (badgeWidth ? `<rect x="20" y="18" width="${badgeWidth}" height="34" rx="17" fill="#000" fill-opacity="0.55"/>` : '') +
        '</svg>'
    );
}

async function renderCard({ title, category, color, footer }) {
    if (!sharp) return null;
    const layers = [];
    let badge = null;
    if (category) badge = await textImage(category.toUpperCase(), { fontfile: FONT_SEMIBOLD, font: 'Oswald SemiBold 20', color: '#ffffff' });
    layers.push({ input: overlaySvg(badge ? badge.width + 28 : 0), top: 0, left: 0 });
    if (badge) layers.push({ input: badge.buf, top: 18 + Math.round((34 - badge.height) / 2), left: 34 });

    let titleImg = null;
    let shadowImg = null;
    for (const size of TITLE_SIZES) {
        const font = `Oswald Bold ${size}`;
        titleImg = await textImage(title, { fontfile: FONT_BOLD, font, color: '#ffffff', width: TITLE_WIDTH });
        if (titleImg.height <= TITLE_MAX_HEIGHT) {
            shadowImg = await textImage(title, { fontfile: FONT_BOLD, font, color: '#000000', width: TITLE_WIDTH });
            break;
        }
        titleImg = null;
    }
    if (titleImg) {
        const top = Math.round((H - titleImg.height) / 2) + 6;
        const left = Math.round((W - titleImg.width) / 2);
        const blurred = await sharp(shadowImg.buf).blur(3).ensureAlpha(0.7).toBuffer();
        layers.push({ input: blurred, top: top + 3, left: left + 2, blend: 'over' });
        layers.push({ input: titleImg.buf, top, left });
    }
    if (footer) {
        const foot = await textImage(footer, { fontfile: FONT_MEDIUM, font: 'Oswald Medium 20', color: '#ffffff' });
        if (foot.width < W - 40) layers.push({ input: foot.buf, top: H - 18 - foot.height, left: 22 });
    }
    const base = await background(photoFor(category), color);
    return sharp(base).composite(layers).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

module.exports = { renderCard, cardColor, photoFor, available: () => !!sharp, DEFAULT_COLORS };
