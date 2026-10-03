'use strict';
// 路由审计：后端实际有的路由 vs 源码里前端调用的接口，找出「前端调了不存在的接口」这类问题。
//
//   node scripts/route-audit.mjs
const fs = require('fs');
const path = require('path');

const V2 = 'E:/v2board';
const EZ = 'E:/EZ-Theme';

// ---------- 1) 后端路由：从 Routes/V1/*.php 里抠出来（路径前缀就是分组前缀） ----------
const ROUTE_FILES = {
  'AdminRoute.php': '/admin',
  'UserRoute.php': '/user',
  'GuestRoute.php': '/guest',
  'PassportRoute.php': '/passport',
  'StaffRoute.php': '/staff',
  'ResellerRoute.php': '/reseller',
  'StoreRoute.php': '/store',
};

const routes = new Set();
const routeDetail = new Map();
for (const [file, prefix] of Object.entries(ROUTE_FILES)) {
  const p = path.join(V2, 'app/Http/Routes/V1', file);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  for (const m of text.matchAll(/\$router->(get|post|put|delete)\s*\(\s*'([^']+)'/gi)) {
    const method = m[1].toLowerCase();
    let url = m[2];
    if (!url.startsWith('/')) url = '/' + url;
    const full = prefix + url;
    routes.add(method + ' ' + full);
    routeDetail.set(method + ' ' + full, file);
  }
}

// ---------- 2) 前端调用：src/api/*.js 里的 url/method ----------
// pathMapper 会把某些路径改写，先读进来
const mapperPath = path.join(EZ, 'src/api/utils/pathMapper.js');
let mapper = {};
if (fs.existsSync(mapperPath)) {
  const t = fs.readFileSync(mapperPath, 'utf8');
  for (const m of t.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) mapper[m[1]] = m[2];
}

const calls = [];
const apiDir = path.join(EZ, 'src/api');
for (const file of fs.readdirSync(apiDir)) {
  if (!file.endsWith('.js') || file === 'request.js') continue;
  const text = fs.readFileSync(path.join(apiDir, file), 'utf8');
  // 一个 export function 一段，取 url 与 method（可能在同一段里换行）
  for (const m of text.matchAll(/export (?:const|function)\s+(\w+)[\s\S]{0,400}?url:\s*[`'"]([^`'"]+)[`'"][\s\S]{0,120}?method:\s*'(\w+)'/g)) {
    calls.push({ fn: m[1], raw: m[2], method: m[3].toLowerCase(), file });
  }
  // 反过来的顺序（method 在前 url 在后）
  for (const m of text.matchAll(/export (?:const|function)\s+(\w+)[\s\S]{0,400}?method:\s*'(\w+)'[\s\S]{0,120}?url:\s*[`'"]([^`'"]+)[`'"][\s\S]{0,40}?\}/g)) {
    const key = m[1];
    if (calls.some((c) => c.fn === key)) continue;
    calls.push({ fn: key, raw: m[3], method: m[2].toLowerCase(), file });
  }
}

// ---------- 3) 比对 ----------
// pathMapper 是「真实路径 → 简写」，源码里写的是简写，这里要反着查回真实路径
const reverseMapper = {};
for (const [real, short] of Object.entries(mapper)) reverseMapper[short] = real;
const norm = (u) => {
  let s = String(u);
  if (reverseMapper[s]) s = reverseMapper[s];
  s = s.replace(/\$\{[^}]*\}/g, 'X');           // 模板变量
  s = s.replace(/^\/api\/v1/, '');
  s = s.replace(/\/$/, '');
  s = s.replace(/\?.*$/, '');
  return s;
};

// 路由侧也做同样的归一化（把 {provider} 之类换成 X）
const routeSet = new Set();
for (const r of routes) {
  const [method, url] = r.split(' ');
  routeSet.add(method + ' ' + url.replace(/\{[^}]+\}/g, 'X'));
}

const missing = [];
const ok = [];
for (const c of calls) {
  const u = norm(c.raw);
  const key = c.method + ' ' + u;
  const hit = routeSet.has(key)
    || [...routeSet].some((r) => {
      const [rm, ru] = r.split(' ');
      if (rm !== c.method) return false;
      // 允许路径参数数量一致时的通配匹配
      const a = ru.split('/');
      const b = u.split('/');
      if (a.length !== b.length) return false;
      return a.every((seg, i) => seg === b[i] || (seg === 'X' && b[i] !== ''));
    });
  (hit ? ok : missing).push({ ...c, normalized: key });
}

console.log('后端路由 ' + routes.size + ' 条；源码 api 里识别到 ' + calls.length + ' 个调用\n');
console.log('=== 前端调了、后端找不到对应路由（' + missing.length + ' 个）===');
for (const m of missing) console.log('  ✗ ' + m.method.toUpperCase() + ' ' + m.normalized + '   ← ' + m.fn + '  (' + m.file + ')');
if (!missing.length) console.log('  （无）');

console.log('\n=== 抽样确认匹配上的（前 8 个）===');
for (const o of ok.slice(0, 8)) console.log('  ✓ ' + o.method.toUpperCase() + ' ' + o.normalized + '   ← ' + o.fn);
