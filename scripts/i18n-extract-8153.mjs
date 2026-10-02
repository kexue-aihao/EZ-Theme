#!/usr/bin/env node
// 从产物 chunk 8153 里抠出 8 种语言的 i18n 字面量 → .refs/i18n-8153.json
//
//   8153 是「8 语言内联」的那块：auth 集（登录页用）的 auth.twoFactor.* / auth.oauth.* /
//   auth.arithmetic.*，以及两套 locale 都要的 landing.plans.*。分语言 chunk 里没有这些。
//
//   node scripts/i18n-extract-8153.mjs dump     # 只打印各语言的命名空间分布
//   node scripts/i18n-extract-8153.mjs write    # 落盘 .refs/i18n-8153.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const REFS = path.join(ROOT, '.refs');
/** 产物 chunk 目录：优先用 .refs 里的转储，没有就直接读线上主题的构建产物 */
const CHUNK_DIRS = [path.join(REFS, 'signature-js'), 'E:/v2board/public/theme/signature/assets/static/js'];

function findChunk(id) {
  for (const dir of CHUNK_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const name = fs.readdirSync(dir).find(f => f.startsWith(String(id) + '.') && f.endsWith('.js'));
    if (name) return path.join(dir, name);
  }
  throw new Error('找不到 chunk ' + id + '（找过：' + CHUNK_DIRS.join('、') + '）');
}

const text = fs.readFileSync(findChunk(8153), 'utf8');

function matchingClose(s, open) {
  let depth = 0, quote = null, esc = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return i; }
  }
  throw new Error('不配平');
}

// 末尾的 {"zh-CN":i,...} 映射：语言码 → 变量名
const mapAt = text.lastIndexOf('{"zh-CN":');
const mapLit = text.slice(mapAt, matchingClose(text, mapAt) + 1);
const LANGS = {};
for (const m of mapLit.matchAll(/"([\w-]+)":([A-Za-z_$][\w$]*)/g)) LANGS[m[1]] = m[2];

/** `const i={...}` 或同一语句里 `,a={...}` */
function objectOf(varName) {
  const re = new RegExp('(?:const|var|let)\\s+' + varName + '\\s*=\\s*\\{|[,;]\\s*' + varName + '\\s*=\\s*\\{', 'g');
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = text.indexOf('{', m.index + m[0].length - 1);
    hits.push({ at: m.index, open, close: matchingClose(text, open) });
    re.lastIndex = open;
  }
  if (hits.length !== 1) throw new Error('变量 ' + varName + ' 命中 ' + hits.length + ' 处，无法确定');
  return text.slice(hits[0].open, hits[0].close + 1);
}

// 非字面量取值（o.SITE_CONFIG.*）的兜底：任何属性访问返回它自己，被当字符串用时给 «expr»
const stub = new Proxy(function () {}, {
  get(t, k) {
    if (k === Symbol.toPrimitive) return () => '«expr»';
    if (k === Symbol.iterator || k === Symbol.toStringTag || k === 'toString' || k === 'valueOf') return undefined;
    return stub;
  },
  apply: () => stub,
});

function sanitize(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = sanitize(x);
    return out;
  }
  return '«expr»';
}

function flatten(obj, prefix, out) {
  out = out || {};
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, full, out);
    else out[full] = v;
  }
  return out;
}

const result = {};
const exprKeys = [];
for (const [lang, varName] of Object.entries(LANGS)) {
  const obj = sanitize(new Function('o', 'return ' + objectOf(varName))(stub));
  const flat = flatten(obj, '', {});
  for (const [k, v] of Object.entries(flat)) if (v === '«expr»') exprKeys.push(lang + '.' + k);
  result[lang] = flat;
}

if ((process.argv[2] || 'dump') === 'write') {
  const out = path.join(REFS, 'i18n-8153.json');
  fs.mkdirSync(REFS, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  for (const [lang, flat] of Object.entries(result)) console.log('  ' + lang + '：' + Object.keys(flat).length + ' key');
  console.log('→ ' + path.relative(ROOT, out));
} else {
  for (const [lang, flat] of Object.entries(result)) {
    const ns = {};
    for (const k of Object.keys(flat)) {
      const p = k.split('.');
      ns[p[0]] = ns[p[0]] || {};
      const sub = p.length > 2 ? p[1] : '(直接)';
      ns[p[0]][sub] = (ns[p[0]][sub] || 0) + 1;
    }
    console.log(lang + '：' + Object.keys(flat).length + ' key');
    for (const [n, subs] of Object.entries(ns)) console.log('    ' + n + ' → ' + JSON.stringify(subs));
  }
}
if (exprKeys.length) console.log('\n非字面量（需人工看，插入时会跳过）：' + exprKeys.length + ' 个 → ' + exprKeys.slice(0, 12).join(', '));
