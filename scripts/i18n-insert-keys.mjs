#!/usr/bin/env node
// 把产物里提取到的文案补进源码 locale —— **只增不删、只增不改**。
//
//   node scripts/i18n-insert-keys.mjs                # dry-run（默认，不落盘）
//   node scripts/i18n-insert-keys.mjs --list         # 只列缺哪些 key
//   node scripts/i18n-insert-keys.mjs --apply        # 落盘
//   node scripts/i18n-insert-keys.mjs --target=auth  # 只处理某一套（main / auth）
//   node scripts/i18n-insert-keys.mjs --source=zh-CN # 以某语言源码为 key 基准（对齐检查用）
//   node scripts/i18n-insert-keys.mjs --from=.refs/batch0.json   # 额外补一份 {lang:{key:值}}（主集）
//
// 两套 locale：
//   主集   src/i18n/locales/<lang>.js      ← profile.*/trafficLog.*/tickets.*（分语言 chunk）+ landing.*（8153）
//   auth 集 src/i18n/locales/auth/<lang>.js ← auth.* / landing.*（8153）
//
// 定位一律**结构化**（花括号配对 + 深度），不按缩进猜层数 —— 缩进只用来生成新行，
// 宽度从文件自身探测。写盘前先求值校验：新增的 key 都在、旧 key 一个不少、旧值一个不变；
// 任一条不过就整文件跳过、绝不落盘。这条纪律是今天用五次失败换来的。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOCALES = path.join(ROOT, 'src', 'i18n', 'locales');
const APPLY = process.argv.includes('--apply');
const LIST = process.argv.includes('--list');
const ONLY_TARGET = (process.argv.find(a => a.startsWith('--target=')) || '').split('=')[1] || '';
const SOURCE = (process.argv.find(a => a.startsWith('--source=')) || '').split('=')[1] || '';
const FROM = (process.argv.find(a => a.startsWith('--from=')) || '').split('=')[1] || '';
/** --from 的 key 补进哪几套（默认只补主集；包住整个 App 的组件两套都要有） */
const FROM_TARGETS = ((process.argv.find(a => a.startsWith('--from-targets=')) || '').split('=')[1] || 'main').split(',');

const ARTIFACT = JSON.parse(fs.readFileSync(path.join(ROOT, '.refs', 'i18n-artifact.json'), 'utf8'));
const C8153 = JSON.parse(fs.readFileSync(path.join(ROOT, '.refs', 'i18n-8153.json'), 'utf8'));
const EXTRA = FROM ? JSON.parse(fs.readFileSync(path.resolve(ROOT, FROM), 'utf8')) : {};

/** 产物侧来源 → 两套 locale 各要哪些 key */
const TARGETS = [
  {
    name: 'main',
    label: '主 locale 集',
    dir: LOCALES,
    useExtra: true,
    wanted: lang => [
      ...Object.keys(EXTRA[lang] || {}),
      ...pick(ARTIFACT[lang], /^(profile|trafficLog|tickets)\./),
      ...pick(C8153[lang], /^landing\./),
    ],
  },
  {
    name: 'auth',
    label: 'auth locale 集',
    dir: path.join(LOCALES, 'auth'),
    useExtra: FROM_TARGETS.includes('auth'),
    wanted: lang => [
      ...(FROM_TARGETS.includes('auth') ? Object.keys(EXTRA[lang] || {}) : []),
      ...pick(C8153[lang], /^(auth|landing)\./),
    ],
  },
];

function pick(flat, re) {
  return flat ? Object.keys(flat).filter(k => re.test(k)) : [];
}

function matchingClose(text, open) {
  let depth = 0, quote = null, esc = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
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
  throw new Error('花括号不配平');
}

/** 命名空间块：同名多处时取缩进最浅的最后一个（== 运行时胜出的那个） */
function findNamespace(text, name) {
  const re = new RegExp('\n([ \t]*)' + name + '[ \t]*:[ \t]*\\{', 'g');
  let best = null, m;
  while ((m = re.exec(text)) !== null) {
    const open = text.indexOf('{', m.index);
    const close = matchingClose(text, open);
    if (!best || m[1].length <= best.indent) best = { indent: m[1].length, open, close };
    re.lastIndex = close;
  }
  return best;
}

/** 块内深度 0 的直接子键名 */
function childKeys(text, open, close) {
  const names = [];
  let depth = 0, quote = null, esc = false;
  for (let i = open + 1; i < close; i++) {
    const c = text[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[') { depth++; continue; }
    if (c === '}' || c === ']') { depth--; continue; }
    if (depth !== 0) continue;
    const m = /^"?([A-Za-z_$][\w$]*)"?\s*:/.exec(text.slice(i, i + 80));
    if (m && (i === 0 || /[\s,{]/.test(text[i - 1]))) names.push(m[1]);
  }
  return names;
}

/** 块内某个直接子键对应的子块（`name: { ... }`），没有则 null */
function findChildBlock(text, open, close, name) {
  const re = new RegExp('(^|[{,])\\s*"?([A-Za-z_$][\\w$]*)"?[ \\t]*:[ \\t]*\\{', 'g');
  re.lastIndex = open;
  let m;
  while ((m = re.exec(text)) !== null && m.index < close) {
    if (m[2] !== name) continue;
    const sub = text.indexOf('{', m.index + m[0].length - 1);
    const subClose = matchingClose(text, sub);
    if (subClose > close) break;
    return { indent: m[1] === '{' ? open + 1 : m.index + 1, open: sub, close: subClose };
  }
  return null;
}

/** 文件缩进宽度：第一个「行首空格 + 非空字符」的宽度 */
function detectUnit(text) {
  const m = /\n( +)\S/.exec(text);
  return m ? m[1].length : 2;
}

/** 块内子行缩进：优先取块内已有行的缩进，空块用 blockIndent + unit */
function childIndentOf(text, block, unit) {
  const m = /\n( +)\S/.exec(text.slice(block.open, block.close));
  return m ? m[1].length : (block.indent || 0) + unit;
}

function renderValue(v) {
  if (typeof v === 'string') {
    if (!v.includes("'") && !v.includes('\\') && !/[\r\n]/.test(v)) return "'" + v + "'";
    return JSON.stringify(v);
  }
  return JSON.stringify(v);
}

function renderObject(tree, indent, unit) {
  const pad = ' '.repeat(indent);
  const inner = Object.entries(tree).map(([k, v]) =>
    pad + k + ': ' + (v && typeof v === 'object' && !Array.isArray(v) ? renderObject(v, indent + unit, unit) : renderValue(v)) + ','
  ).join('\n');
  const kids = Object.keys(tree).length;
  return kids ? '{\n' + inner + '\n' + ' '.repeat(Math.max(0, indent - unit)) + '}' : '{}';
}

function evalLocale(text) {
  let src = text.replace(/^﻿/, '').split('\n').filter(l => !/^\s*import\s/.test(l)).join('\n');
  src = src.replace(/SITE_CONFIG\.[\w$.]+/g, '"«stub»"').replace(/export\s+default\s+/, 'return ');
  return new Function(src)();
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

/** 递归收集「插在最后一个非空白字符之后」的编辑；同一位置合并成一条，逗号守卫只加一次 */
function collectEdits(text, block, tree, indent, unit, edits, added, prefix) {
  const at = insertPoint(text, block.close);
  for (const [k, v] of Object.entries(tree)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const child = findChildBlock(text, block.open, block.close, k);
      if (child) {
        collectEdits(text, child, v, indent + unit, unit, edits, added, prefix.concat(k));
      } else {
        editsAt(edits, at).push('\n' + ' '.repeat(indent) + k + ': ' + renderObject(v, indent + unit, unit) + ',');
        for (const sub of Object.keys(flatten(v, '', {}))) added.push(prefix.concat(k, sub).join('.'));
      }
    } else {
      editsAt(edits, at).push('\n' + ' '.repeat(indent) + k + ': ' + renderValue(v) + ',');
      added.push(prefix.concat(k).join('.'));
    }
  }
}

/** 块尾插入点：最后一个非空白字符之后（这样 `}` 仍在自己的行上，跟源文件风格一致） */
function insertPoint(text, close) {
  let i = close - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  return i + 1;
}

/** export default { ... } 这个根对象（用来新建顶层命名空间） */
function rootBlock(text) {
  const m = /export\s+default\s*\{/.exec(text);
  if (!m) return null;
  const open = text.indexOf('{', m.index);
  return { open, close: matchingClose(text, open), indent: 0 };
}

function editsAt(edits, at) {
  if (!edits.has(at)) edits.set(at, []);
  return edits.get(at);
}

let grandAdded = 0, grandFiles = 0;
const failures = [];

for (const target of TARGETS) {
  if (ONLY_TARGET && target.name !== ONLY_TARGET) continue;
  console.log('\n■ ' + target.label + '（' + path.relative(ROOT, target.dir) + '）');
  const files = fs.readdirSync(target.dir).filter(f => /^[\w-]+\.js$/.test(f) && f !== 'index.js').sort();
  for (const file of files) {
    const lang = file.replace(/\.js$/, '');
    const abs = path.join(target.dir, file);
    const raw = fs.readFileSync(abs, 'utf8');
    const eol = raw.includes('\r\n') ? (raw.match(/(?<!\r)\n/) ? null : '\r\n') : '\n';
    if (eol === null) { failures.push(file + '：换行符混用（CRLF 与 LF 都有），拒绝改写'); continue; }
    const text = raw.replace(/\r\n/g, '\n');
    const unit = detectUnit(text);
    let before, wantedList;
    try {
      before = flatten(evalLocale(text), '', {});
    } catch (e) { failures.push(file + '：现有文件求值失败 —— ' + e.message.slice(0, 80)); continue; }

    if (SOURCE) {
      const srcFile = path.join(target.dir, SOURCE + '.js');
      if (!fs.existsSync(srcFile)) { failures.push(file + '：--source=' + SOURCE + ' 文件不存在'); continue; }
      const srcFlat = flatten(evalLocale(fs.readFileSync(srcFile, 'utf8').replace(/^﻿/, '')), '', {});
      wantedList = Object.keys(srcFlat);
    } else {
      wantedList = target.wanted(lang);
    }

    const missing = wantedList
      .filter(k => !(k in before))
      .sort();
    if (!missing.length) { console.log('  ✓ ' + file + '：无缺'); grandFiles++; continue; }

    // 值来自产物（--source 模式下没有值可取，只报缺）
    const values = SOURCE ? null : mergeFlat([
      target.useExtra ? (EXTRA[lang] || {}) : {},
      ARTIFACT[lang] || {},
      C8153[lang] || {},
    ]);
    const expr = missing.filter(k => values && values[k] === '«expr»');

    if (LIST || SOURCE || expr.length) {
      console.log('  · ' + file + ' 缺 ' + missing.length + ' 个：' + missing.slice(0, 6).join(', ') + (missing.length > 6 ? ' …' : ''));
      if (expr.length) failures.push(file + '：' + expr.length + ' 个 key 在产物里是非字面量，需人工看：' + expr.slice(0, 4).join(', '));
      if (SOURCE) { grandFiles++; continue; }
    }

    // 建树（只放有值、且不是 «expr» 的）
    const tree = {};
    for (const k of missing) {
      const val = values[k];
      if (val === undefined || val === '«expr»') continue;
      const parts = k.split('.');
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) node = (node[parts[i]] = node[parts[i]] || {});
      node[parts[parts.length - 1]] = val;
    }

    const edits = new Map();
    const added = [];
    const missingNs = [];
    for (const ns of Object.keys(tree)) {
      const block = findNamespace(text, ns);
      if (!block) {
        // 顶层命名空间整个不存在：新建一个块，插在 export default 对象的末尾
        const root = rootBlock(text);
        if (!root) { missingNs.push(ns); continue; }
        const at = insertPoint(text, root.close);
        editsAt(edits, at).push('\n' + ' '.repeat(unit) + ns + ': ' + renderObject(tree[ns], unit * 2, unit) + ',');
        for (const sub of Object.keys(flatten(tree[ns], '', {}))) added.push(ns + '.' + sub);
        continue;
      }
      collectEdits(text, block, tree[ns], childIndentOf(text, block, unit), unit, edits, added, [ns]);
    }
    if (missingNs.length) { failures.push(file + '：源码里找不到这些顶层命名空间 —— ' + missingNs.join(', ')); continue; }
    if (!added.length) { console.log('  · ' + file + '：可插入 0 个（其余都是非字面量）'); continue; }

    // 应用（位置从后往前，同一位置的内容按收集顺序拼接）
    let out = text;
    for (const at of [...edits.keys()].sort((a, b) => b - a)) {
      const body = edits.get(at).join('');
      const tail = out.slice(0, at).replace(/\s+$/, '').slice(-1);
      const guard = (tail && tail !== ',' && tail !== '{' && tail !== '[') ? ',' : '';
      out = out.slice(0, at) + guard + body + out.slice(at);
    }

    // 写盘前校验：语法可通过、旧 key 一个不少、旧值一个不变、新 key 全在
    let after;
    try { after = flatten(evalLocale(out), '', {}); }
    catch (e) { failures.push(file + '：改写后求值失败（未落盘）—— ' + e.message.slice(0, 80)); continue; }
    const lost = Object.keys(before).filter(k => !(k in after));
    const changed = Object.keys(before).filter(k => k in after && before[k] !== after[k]);
    const notAdded = added.filter(k => !(k in after));
    if (lost.length || changed.length || notAdded.length) {
      failures.push(file + '：校验不过（未落盘）—— 丢 ' + lost.length + ' 改 ' + changed.length + ' 缺 ' + notAdded.length
        + (lost.length ? '；丢：' + lost.slice(0, 3).join(', ') : ''));
      continue;
    }

    // 报告：按「命名空间.子命名空间」汇总
    const summary = {};
    for (const k of added) {
      const p = k.split('.');
      const head = p.length > 2 ? p.slice(0, 2).join('.') : p[0];
      summary[head] = (summary[head] || 0) + 1;
    }
    console.log('  ✓ ' + file + '：+' + added.length + '（' + Object.entries(summary).map(([k, n]) => k + ' ' + n).join('、')
      + '）；旧 ' + Object.keys(before).length + ' 个 key 一个没动');
    grandAdded += added.length; grandFiles++;
    if (APPLY) fs.writeFileSync(abs, (eol === '\n' ? out : out.replace(/\n/g, eol)));
  }
}

console.log('\n' + (APPLY ? '已写入 ' : '（dry-run，未写入；加 --apply 才落盘）')
  + grandFiles + ' 个文件，共新增 ' + grandAdded + ' 个 key');
if (failures.length) {
  console.log('\n需要处理的 ' + failures.length + ' 项：');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}

function mergeFlat(list) {
  const out = {};
  for (const obj of list) Object.assign(out, obj);
  return out;
}
