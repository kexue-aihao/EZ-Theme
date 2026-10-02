#!/usr/bin/env node
// 构建产物覆盖对照：dist 里能不能找到搬进来的文案（逐语言全量，不是抽样）。
// 这是「构建不可复现、无法逐字节比对」的替代验证 —— 文案必须在产物里出现，且逐字一致。
//
//   npm run build && node scripts/verify-dist-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');

function walk(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(js|css|html)$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = walk(DIST);
const bundleRaw = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
console.log('dist 文件 ' + files.length + ' 个，合计 ' + Math.round(bundleRaw.length / 1024) + ' KB');

// Terser 会把非 ASCII 写成 \xHH（≤0xFF）与 \uHHHH 混用 —— 先解码再比，不去猜它的编码风格
const bundle = bundleRaw
  .replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\n/g, '\n')
  .replace(/\\"/g, '"');

function evalLocale(file) {
  let text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  text = text.split('\n').filter(l => !/^\s*import\s/.test(l)).join('\n');
  text = text.replace(/SITE_CONFIG\.[\w$.]+/g, '"«stub»"').replace(/export\s+default\s+/, 'return ');
  return new Function(text)();
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

/** 产物已解码，直接比；再兜一层转义引号 */
function present(value) {
  if (bundle.includes(value)) return true;
  return bundle.includes(value.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
}

const ARTIFACT = JSON.parse(fs.readFileSync(path.join(ROOT, '.refs', 'i18n-artifact.json'), 'utf8'));
const C8153 = JSON.parse(fs.readFileSync(path.join(ROOT, '.refs', 'i18n-8153.json'), 'utf8'));
const LANGS = ['zh-CN', 'en-US', 'zh-TW', 'ja-JP', 'ko-KR', 'ru-RU', 'fa-IR', 'vi-VN'];

const SETS = [
  {
    name: '主集',
    file: lang => path.join(ROOT, 'src', 'i18n', 'locales', lang + '.js'),
    keys: lang => [
      ...Object.keys(ARTIFACT[lang] || {}).filter(k => /^(profile|trafficLog|tickets)\./.test(k)),
      ...Object.keys(C8153[lang] || {}).filter(k => /^landing\./.test(k)),
    ],
  },
  {
    name: 'auth 集',
    file: lang => path.join(ROOT, 'src', 'i18n', 'locales', 'auth', lang + '.js'),
    keys: lang => Object.keys(C8153[lang] || {}).filter(k => /^(auth|landing)\./.test(k)),
  },
];

let bad = 0;
for (const set of SETS) {
  for (const lang of LANGS) {
    const flat = flatten(evalLocale(set.file(lang)), '', {});
    const keys = set.keys(lang).filter(k => k in flat && flat[k] !== '«expr»' && flat[k] !== '«stub»');
    const miss = keys.filter(k => !present(flat[k]));
    if (miss.length) { bad++; console.log('  ✗ ' + set.name + ' ' + lang + '：' + miss.length + '/' + keys.length + ' 没进产物 —— ' + miss.slice(0, 4).join(', ')); }
    else console.log('  ✓ ' + set.name + ' ' + lang.padEnd(6) + keys.length + ' 条文案都在 dist 里');
  }
}
console.log(bad ? '\n✗ ' + bad + ' 项没覆盖' : '\n✓ dist 覆盖全部通过');
process.exit(bad ? 1 : 0);
