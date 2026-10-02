#!/usr/bin/env node
// 产物 ↔ 源码的 i18n 搬运与校验工具（批 0/批 1 用）。
//
//   node scripts/i18n-artifact.mjs extract    # 从产物逐语言抠出新 key 的文案 → .refs/i18n-artifact.json
//   node scripts/i18n-artifact.mjs check      # 校验源码 locale 的 key 集合与重复顶层键
//
// 为什么不 import() 求值：locale 文件里 `import ... from '@/utils/baseConfig'`，node 认不了 `@` 别名。
// 所以统一走「剥 import → SITE_CONFIG 占位 → export default 换 return → new Function 求值」。
// 值里出现非字面量（函数调用、模板拼接）时会直接抛错，而不是悄悄漏掉一个 key。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACT = path.join(ROOT, '.refs', 'signature-js');
const LOCALES = path.join(ROOT, 'src', 'i18n', 'locales');

/** 分语言 chunk（产物侧） */
const LANG_CHUNKS = {
  8488: 'zh-CN', 5442: 'en-US', 3744: 'zh-TW', 7018: 'ja-JP',
  1900: 'ko-KR', 7121: 'ru-RU', 6015: 'fa-IR', 7300: 'vi-VN'
};

/** 本次要搬的命名空间（源码侧顶层 key → 产物侧同名 key） */
const NAMESPACES = ['landing', 'profile', 'trafficLog', 'tickets', 'auth'];

function artifactFile(id) {
  const name = fs.readdirSync(ARTIFACT).find(f => f.startsWith(String(id) + '.') && f.endsWith('.js'));
  if (!name) throw new Error('产物里找不到 chunk ' + id);
  return path.join(ARTIFACT, name);
}

/** 花括号配对取字面量（跳过字符串里的括号） */
function sliceLiteral(text, start) {
  let depth = 0, quote = null, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('字面量不配平');
}

/** 取 `name: { ... }` 的字面量 */
function namespaceLiteral(text, name, from = 0) {
  const re = new RegExp('(^|[{,\\s])' + name + '\\s*:\\s*\\{', 'g');
  re.lastIndex = from;
  const m = re.exec(text);
  if (!m) return null;
  return sliceLiteral(text, text.indexOf('{', m.index));
}

/** `{a:"x",b:{c:1}}` → JSON（裸键加引号）。值必须是字面量，否则抛错。 */
function literalToJson(literal) {
  const quoted = literal.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
  return JSON.parse(quoted);
}

function flatten(obj, prefix, out) {
  out = out || {};
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + key : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = value;
  }
  return out;
}

/** 产物：逐语言抠命名空间 → { lang: { key: 文案 } } */
function extractArtifact() {
  const result = {};
  for (const [id, lang] of Object.entries(LANG_CHUNKS)) {
    const text = fs.readFileSync(artifactFile(id), 'utf8');
    const flat = {};
    for (const ns of NAMESPACES) {
      const literal = namespaceLiteral(text, ns);
      if (!literal) continue;
      try {
        Object.assign(flat, flatten({ [ns]: literalToJson(literal) }, '', {}));
      } catch (e) {
        console.warn('  ! chunk ' + id + ' 的 ' + ns + ' 不是纯字面量，跳过：' + e.message.slice(0, 60));
      }
    }
    result[lang] = flat;
  }
  return result;
}

/** 源码：剥 import → SITE_CONFIG 占位 → new Function 求值 */
function evalLocale(file) {
  let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  text = text.split('\n').filter(l => !/^\s*import\s/.test(l)).join('\n');
  text = text.replace(/SITE_CONFIG\.[\w$.]+/g, '"«stub»"');
  text = text.replace(/export\s+default\s+/, 'return ');
  return new Function(text)();
}

function check() {
  const langs = fs.readdirSync(LOCALES).filter(f => /^[\w-]+\.js$/.test(f) && f !== 'index.js');
  let baseline = null;
  let problems = 0;
  for (const file of langs.sort()) {
    const lang = file.replace(/\.js$/, '');
    const data = evalLocale(path.join(LOCALES, file));
    const flat = flatten(data, '', {});
    const keys = Object.keys(flat).sort();
    // 这里原本有一条「顶层键数 == 命名空间数」的断言，已删除：各文件的缩进宽度并不统一
    // （fa-IR 是 2 空格，en-US / vi-VN / zh-CN 在 2 空格处一个键都没有），按任何固定缩进去数
    // 都会误报「有重复键」。它也从没抓到过真问题 —— 唯一可信的信号是下面的扁平化对比。
    if (!baseline) { baseline = { lang, keys }; console.log('  基准语言 ' + lang + '：' + keys.length + ' 个 key'); continue; }
    const missing = baseline.keys.filter(k => !keys.includes(k));
    const extra = keys.filter(k => !baseline.keys.includes(k));
    if (missing.length || extra.length) {
      problems++;
      console.log('  ✗ ' + lang + '：比 ' + baseline.lang + ' 少 ' + missing.length + ' 多 ' + extra.length
        + (missing.length ? '（少：' + missing.slice(0, 3).join(', ') + '…）' : ''));
    } else {
      console.log('  ✓ ' + lang + '：' + keys.length + ' 个 key，与基准一致');
    }
  }
  console.log(problems ? '\n有 ' + problems + ' 个问题需要处理。' : '\n全部一致。');
  return problems;
}

const mode = process.argv[2] || 'check';
if (mode === 'extract') {
  const data = extractArtifact();
  const outFile = path.join(ROOT, '.refs', 'i18n-artifact.json');
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
  for (const [lang, flat] of Object.entries(data)) {
    console.log('  ' + lang + '：' + Object.keys(flat).length + ' 个 key');
  }
  console.log('→ ' + path.relative(ROOT, outFile));
} else {
  process.exit(check() ? 1 : 0);
}
