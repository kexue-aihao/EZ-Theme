#!/usr/bin/env node
// 功能覆盖对照：signature 硬编译产物里的每个功能，源码里到底落地了没有。
//
// 判定依据不是「locale 里有没有这些 key」（批 1 之后全都有，说明不了任何事），
// 而是「**源码有没有真的用它**」：模板里 $t() 引用、api/*.js 里的接口函数、组件/类名。
//
//   node scripts/feature-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHUNKS = [path.join(ROOT, '.refs', 'signature-js'), 'E:/v2board/public/theme/signature/assets/static/js'];
const ARTIFACT_DIR = CHUNKS.find(d => fs.existsSync(d));

function readAll(dir, filter, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist' && e.name !== '.refs') readAll(full, filter, out); }
    else if (filter(e.name)) out.push(full);
  }
  return out;
}

const artifact = readAll(ARTIFACT_DIR, f => f.endsWith('.js')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
// 源码侧只算「真的用它」的地方：模板 / 脚本 / 接口，不算多语言字典自己
const srcFiles = readAll(path.join(ROOT, 'src'), f => /\.(vue|js|ts)$/.test(f))
  .filter(f => !f.includes(path.join('i18n', 'locales')));
const src = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

/** 每个功能：产物里必须存在的标记、源码里应该出现的标记 */
const FEATURES = [
  {
    name: '两步验证 · 个人中心卡',
    inArtifact: ['profile.twoFactor.title', '/user/2fa/status', '/user/2fa/setup', '/user/2fa/recovery-codes/regenerate'],
    inSource: ['profile.twoFactor.', 'user/2fa/status', 'user/2fa/recovery-codes/regenerate'],
  },
  {
    name: '两步验证 · 登录流程',
    inArtifact: ['auth.twoFactor.title', '/passport/auth/verify2fa', '/passport/auth/2fa/setup'],
    inSource: ['auth.twoFactor.', 'passport/auth/verify2fa'],
  },
  {
    name: 'OAuth 登录入口',
    inArtifact: ['auth.oauth.divider', '/passport/oauth/complete', 'oauth/'],
    inSource: ['auth.oauth.', 'passport/oauth/complete'],
  },
  {
    name: '算术验证码',
    inArtifact: ['auth.arithmetic.label', 'arithmetic'],
    inSource: ['auth.arithmetic.', 'arithmetic'],
  },
  {
    name: '共享套餐流量进度',
    inArtifact: ['trafficLog.sharedTraffic.progressTitle', 'shared_subscription'],
    inSource: ['trafficLog.sharedTraffic.', 'shared_subscription'],
  },
  {
    name: '随机密码',
    inArtifact: ['profile.passwordReset.title', '/user/resetPassword'],
    inSource: ['profile.passwordReset.', 'user/resetPassword'],
  },
  {
    name: '售后群绑定',
    inArtifact: ['profile.telegramBinding.title', '/user/telegram/binding/prepare'],
    inSource: ['profile.telegramBinding.', 'telegram/binding/prepare'],
  },
  {
    name: '品牌落地页 · 套餐区',
    inArtifact: ['landing.plans.title', '/guest/plan/fetch'],
    inSource: ['landing.plans.', 'guest/plan/fetch'],
  },
  {
    name: '品牌落地页 · 滚动引导',
    inArtifact: ['landing.scrollToPlans'],
    inSource: ['landing.scrollToPlans'],
  },
  {
    name: '站点状态闸门',
    inArtifact: ['site_status', 'maintenance'],
    inSource: ['site_status', 'maintenance'],
  },
  {
    name: 'logo 加载失败兜底',
    inArtifact: ['handleLogoError'],
    inSource: ['handleLogoError'],
  },
  {
    name: '工单刷新',
    inArtifact: ['tickets.refresh'],
    inSource: ['tickets.refresh'],
  },
];

console.log('产物 chunk：' + fs.readdirSync(ARTIFACT_DIR).length + ' 个；源码文件：' + srcFiles.length + ' 个（已排除 i18n 字典）');
console.log('');
console.log('功能'.padEnd(26) + '产物  ' + '源码  ' + '判定');
console.log('-'.repeat(64));
let done = 0, todo = 0;
for (const f of FEATURES) {
  const inArt = f.inArtifact.filter(m => artifact.includes(m)).length;
  const inSrc = f.inSource.filter(m => src.includes(m)).length;
  const artOk = inArt === f.inArtifact.length;
  const srcOk = inSrc === f.inSource.length;
  let verdict;
  if (srcOk) { verdict = '✓ 已落地'; done++; }
  else if (artOk) { verdict = '✗ 没做（产物有 ' + f.inArtifact.length + '/' + f.inArtifact.length + '，源码只有 ' + inSrc + '/' + f.inSource.length + '）'; todo++; }
  else { verdict = '? 产物里也没找全（' + inArt + '/' + f.inArtifact.length + '），标记要修'; }
  console.log(f.name.padEnd(24) + String(inArt + '/' + f.inArtifact.length).padEnd(7) + String(inSrc + '/' + f.inSource.length).padEnd(7) + verdict);
}
console.log('-'.repeat(64));
console.log('已落地 ' + done + ' 项，未落地 ' + todo + ' 项，共 ' + FEATURES.length + ' 项');
