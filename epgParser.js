const OPEN = Buffer.from('<programme');
const CLOSE = Buffer.from('</programme>');
const TITLE = [Buffer.from('<title'), Buffer.from('</title>')];
const DESC = [Buffer.from('<desc'), Buffer.from('</desc>')];
const SUB_TITLE = [Buffer.from('<sub-title'), Buffer.from('</sub-title>')];
const CATEGORY = [Buffer.from('<category'), Buffer.from('</category>')];
const LIVE = Buffer.from('<live');
const PREVIOUSLY_SHOWN = Buffer.from('<previously-shown');
const MAX_CATEGORIES = 3;
const CATEGORY_MAX_CHARS = 40;
const MAX_CARRY = 1 << 20;
const GT = 0x3e;
const SLASH = 0x2f;

const NAMED = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"]]);

function decodeEntities(s) {
    if (s.indexOf('&') === -1) return s;
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] !== '#') return NAMED.get(e) ?? m;
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    });
}

function isNameEnd(byte) {
    return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === GT || byte === SLASH;
}

function parseAttrs(tag) {
    const attrs = {};
    const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(tag)) !== null) attrs[m[1]] = decodeEntities(m[2] ?? m[3]);
    return attrs;
}

function childText(buf, from, to, [open, close], maxChars) {
    let a = buf.indexOf(open, from);
    while (a !== -1 && a < to && !isNameEnd(buf[a + open.length])) a = buf.indexOf(open, a + open.length);
    if (a === -1 || a >= to) return '';
    const gt = buf.indexOf(GT, a);
    if (gt === -1 || gt >= to || buf[gt - 1] === SLASH) return '';
    const b = buf.indexOf(close, gt);
    if (b === -1 || b > to) return '';
    let s = buf.toString('utf8', gt + 1, Math.min(b, gt + 1 + maxChars * 6)).trim();
    if (s.startsWith('<![CDATA[')) s = s.slice(9).replace(/]]>[\s\S]*$/, '');
    else s = decodeEntities(s);
    return s.length > maxChars ? s.slice(0, maxChars).trimEnd() : s;
}

function hasTag(buf, from, to, open) {
    let a = buf.indexOf(open, from);
    while (a !== -1 && a < to && !isNameEnd(buf[a + open.length])) a = buf.indexOf(open, a + open.length);
    return a !== -1 && a < to;
}

function childTexts(buf, from, to, tag, maxChars, limit) {
    const out = [];
    let pos = from;
    while (out.length < limit) {
        let a = buf.indexOf(tag[0], pos);
        while (a !== -1 && a < to && !isNameEnd(buf[a + tag[0].length])) a = buf.indexOf(tag[0], a + tag[0].length);
        if (a === -1 || a >= to) break;
        const b = buf.indexOf(tag[1], a);
        if (b === -1 || b > to) break;
        const s = childText(buf, a, b + tag[1].length, tag, maxChars);
        if (s && !out.includes(s)) out.push(s);
        pos = b + tag[1].length;
    }
    return out;
}

async function parseXmltvStream(stream, { accept, onProgramme, maxText = 400 }) {
    let carry = null;
    let seen = 0;
    for await (const chunk of stream) {
        const buf = carry ? Buffer.concat([carry, chunk]) : chunk;
        let pos = 0;
        for (;;) {
            const a = buf.indexOf(OPEN, pos);
            if (a === -1) {
                pos = Math.max(pos, buf.length - OPEN.length);
                break;
            }
            if (a + OPEN.length >= buf.length) {
                pos = a;
                break;
            }
            if (!isNameEnd(buf[a + OPEN.length])) {
                pos = a + OPEN.length;
                continue;
            }
            const tagEnd = buf.indexOf(GT, a);
            if (tagEnd === -1) {
                pos = a;
                break;
            }
            let end;
            if (buf[tagEnd - 1] === SLASH) {
                end = tagEnd + 1;
            } else {
                const c = buf.indexOf(CLOSE, tagEnd);
                if (c === -1) {
                    pos = a;
                    break;
                }
                end = c + CLOSE.length;
            }
            seen++;
            const attrs = parseAttrs(buf.toString('utf8', a + OPEN.length, tagEnd));
            const accepted = attrs.channel ? accept(attrs.channel, attrs.start, attrs.stop) : null;
            if (accepted) {
                onProgramme(attrs.channel, accepted,
                    childText(buf, tagEnd, end, TITLE, maxText),
                    childText(buf, tagEnd, end, DESC, maxText),
                    {
                        subTitle: childText(buf, tagEnd, end, SUB_TITLE, 120),
                        categories: childTexts(buf, tagEnd, end, CATEGORY, CATEGORY_MAX_CHARS, MAX_CATEGORIES),
                        live: hasTag(buf, tagEnd, end, LIVE),
                        repeat: hasTag(buf, tagEnd, end, PREVIOUSLY_SHOWN)
                    });
            }
            pos = end;
        }
        carry = pos < buf.length ? buf.subarray(pos) : null;
        if (carry && carry.length > MAX_CARRY) carry = null;
        await new Promise(setImmediate);
    }
    return { seen };
}

module.exports = { parseXmltvStream, decodeEntities };
