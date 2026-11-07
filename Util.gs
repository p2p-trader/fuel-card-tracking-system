/**
 * Util.gs — shared helpers: ids, dates, numbers, password hashing, SVG sanitize.
 */

function uid() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function monthKeyOf(dateStr) {
  return String(dateStr || '').slice(0, 7); // yyyy-MM
}

function currentMonthKey() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
}

function prevMonthKey(mk) {
  var y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  return y + '-' + ('0' + m).slice(-2);
}

function daysInMonthKey(mk) {
  var y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10);
  return new Date(y, m, 0).getDate();
}

/** Add n days to a yyyy-MM-dd string, return yyyy-MM-dd. */
function addDays(dateStr, n) {
  var p = dateStr.split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10) + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function daysBetween(a, b) { // b - a in whole days (yyyy-MM-dd strings)
  var pa = a.split('-'), pb = b.split('-');
  var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]), db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
  return Math.round((db - da) / 86400000);
}

function num(v, dflt) {
  var n = parseFloat(v);
  return isNaN(n) ? (dflt || 0) : n;
}

function round2(n) { return Math.round(num(n) * 100) / 100; }

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- passwords (salted SHA-256; plain text is never stored) ---------- */

function hashPassword(password, salt) {
  var raw = salt + '::' + String(password);
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function newSalt() { return Utilities.getUuid().replace(/-/g, ''); }

/* ---------- SVG logo sanitize (allowlist; strips scripts/handlers/external refs) ---------- */

var SVG_ALLOWED_TAGS = ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline',
  'polygon', 'text', 'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc'];
var SVG_ALLOWED_ATTRS = ['xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-opacity', 'fill-rule', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'transform',
  'font-family', 'font-size', 'font-weight', 'text-anchor', 'offset', 'stop-color',
  'stop-opacity', 'gradientunits', 'id', 'clip-rule'];

function sanitizeSvg(code) {
  if (!code) return '';
  var s = String(code).slice(0, 30000);
  if (!/<svg[\s>]/i.test(s)) return '';
  // Drop dangerous elements entirely (with contents)
  s = s.replace(/<(script|style|image|use|foreignObject|a|animate|set|iframe|link|meta)\b[\s\S]*?(<\/\1>|\/>)/gi, '');
  // Rebuild keeping only allowed tags/attributes
  return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)(\/?)>/g, function (m, tag, attrs, selfClose) {
    var t = tag.toLowerCase();
    if (SVG_ALLOWED_TAGS.indexOf(t) === -1) return '';
    var closing = m.charAt(1) === '/';
    if (closing) return '</' + t + '>';
    var kept = '';
    var re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, am;
    while ((am = re.exec(attrs || '')) !== null) {
      var an = am[1].toLowerCase();
      var av = am[3] != null ? am[3] : am[4];
      if (SVG_ALLOWED_ATTRS.indexOf(an) === -1) continue;
      if (/javascript:|data:|url\s*\(\s*['"]?\s*(?!#)/i.test(av)) continue;
      kept += ' ' + an + '="' + String(av).replace(/"/g, '&quot;') + '"';
    }
    return '<' + t + kept + (selfClose ? '/>' : '>');
  });
}

/* ---------- errors ---------- */

function fail(msg) { throw new Error(msg); }
