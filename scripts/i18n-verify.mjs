#!/usr/bin/env node
// 批 1 的验收闸门（两套 locale 都查）：
//   ① key 集合：8 个语言的扁平 key 集合必须一致（只允许「多」——多出来的是各语言特有的旧键）
//   ② 逐字一致：从产物搬来的每个 key，其值必须**逐字出现在该语言的产物 chunk 里**
//      （直接读 chunk 文件，不读中间 JSON —— 避免自己写的 JSON 自己验自己）
//
//   node scripts/i18n-verify.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOCALES = path.join(ROOT, 'src', 'i18n', 'locales');
const CHUNKS = path.join(ROOT, '.refs', 'signature-js');

const LANGS = ['zh-CN', 'en-US', 'zh-TW', 'ja-JP', 'ko-KR', 'ru-RU', 'fa-IR', 'vi-VN'];
const LANG_CHUNKS = { 'zh-CN': 8488, 'en-US': 5442, 'zh-TW': 3744, 'ja-JP': 7018, 'ko-KR': 1900, 'ru-RU': 7121, 'fa-IR': 6015, 'vi-VN': 7300 };
const AUTH_CHUNK = 8153;

const ARTIFACT = JSON.parse(fs.readFileSync(path.join(ROOT, '.refs', 'i18n-artifact.json'), 'utf8'));
const C8153 = JSON.parse(fs.readFileSync(path.join(ROOT, '.refs', 'i18n-8153.json'), 'utf8'));

const SETS = [
  {
    name: '主 locale 集',
    file: lang => path.join(LOCALES, lang + '.js'),
    chunkIds: lang => [LANG_CHUNKS[lang], AUTH_CHUNK],
    moved: lang => [
      ...Object.keys(ARTIFACT[lang] || {}).filter(k => /^(profile|trafficLog|tickets)\./.test(k)),
      ...Object.keys(C8153[lang] || {}).filter(k => /^landing\./.test(k)),
    ],
  },
  {
    name: 'auth locale 集',
    file: lang => path.join(LOCALES, 'auth', lang + '.js'),
    chunkIds: () => [AUTH_CHUNK],
    moved: lang => Object.keys(C8153[lang] || {}).filter(k => /^(auth|landing)\./.test(k)),
  },
];

function chunkText(id) {
  const name = fs.readdirSync(CHUNKS).find(f => f.startsWith(String(id) + '.') && f.endsWith('.js'));
  if (!name) throw new Error('找不到 chunk ' + id);
  return fs.readFileSync(path.join(CHUNKS, name), 'utf8');
}

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

/** 产物里字符串可能带转义，三种写法都试 */
function present(chunk, value) {
  if (chunk.includes(value)) return true;
  const esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  if (chunk.includes(esc)) return true;
  const uni = [...value].map(c => (c.codePointAt(0) > 126 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)).join('');
  return chunk.includes(uni);
}

let problems = 0;
for (const set of SETS) {
  console.log('\n■ ' + set.name);
  const flats = {};
  for (const lang of LANGS) flats[lang] = flatten(evalLocale(set.file(lang)), '', {});
  const baseline = 'en-US';
  for (const lang of LANGS) {
    const keys = Object.keys(flats[lang]);
    const missing = Object.keys(flats[baseline]).filter(k => !(k in flats[lang]));
    const extra = keys.filter(k => !(k in flats[baseline]));
    if (missing.length) { problems++; console.log('  ✗ ' + lang + '：比 ' + baseline + ' 少 ' + missing.length + '（' + missing.slice(0, 4).join(', ') + '）'); }
    else console.log('  ✓ ' + lang.padEnd(6) + keys.length + ' 个 key' + (extra.length ? '（比基准多 ' + extra.length + '，各语言特有）' : ''));
  }
}

console.log('\n■ 文案是否逐字来自产物');
for (const set of SETS) {
  for (const lang of LANGS) {
    const flat = flatten(evalLocale(set.file(lang)), '', {});
    const chunks = set.chunkIds(lang).map(chunkText).join('\n');
    const moved = set.moved(lang).filter(k => k in flat && flat[k] !== '«expr»' && flat[k] !== '«stub»');
    const bad = moved.filter(k => !present(chunks, flat[k]));
    if (bad.length) { problems++; console.log('  ✗ ' + set.name + ' ' + lang + '：' + bad.length + '/' + moved.length + ' 个对不上产物 —— ' + bad.slice(0, 5).join(', ')); }
    else console.log('  ✓ ' + set.name + ' ' + lang.padEnd(6) + moved.length + ' 个 key 与产物逐字一致');
  }
}

console.log(problems ? '\n✗ ' + problems + ' 项未通过' : '\n✓ 全部通过');
process.exit(problems ? 1 : 0);
