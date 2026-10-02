# i18n 搬运工具（产物 → 源码）

把线上 `signature` 主题**硬编译产物**里的文案，逐语言搬回 `src/i18n/locales/`。
纪律：**只增不改** —— 不动已有 key、不动已有值、不动原文件的排版风格。

## 两套 locale 的接法（决定了 key 该放哪）

`src/i18n/index.js` 按登录状态二选一，再合并进**同一个** i18n 实例（`mergeLocaleMessage`）：

| 状态 | 载入 | 谁在用 |
| --- | --- | --- |
| 未登录 | `src/i18n/locales/auth/<lang>.js`（auth 集） | 登录 / 注册 / 找回密码页 |
| 已登录 | `src/i18n/locales/<lang>.js`（主集） | 其余全部页面 |

所以同一功能在两个位置会用到两套 key，**别放错**：

- `auth.twoFactor.*`（登录时弹的二步验证）→ **auth 集**
- `profile.twoFactor.*`（个人中心里的二步验证卡）→ **主集**
- `landing.*` → **两套都要有**（落地页登录前后都能进）

## 数据流

```bash
# 1) 产物 chunk 转储（51 个文件，全部是 0 换行单行压缩）
mkdir -p .refs/signature-js && cp E:/v2board/public/theme/signature/assets/static/js/*.js .refs/signature-js/

# 2) 分语言 chunk → profile.* / trafficLog.* / tickets.* / landing.*（8 语言各一份）
node scripts/i18n-artifact.mjs extract      # → .refs/i18n-artifact.json
node scripts/i18n-artifact.mjs check        # 主集 8 语言 key 集合是否一致

# 3) 8153（8 语言内联的那块）→ auth 集 + landing.plans.*
node scripts/i18n-extract-8153.mjs write    # → .refs/i18n-8153.json

# 4) 插入（默认 dry-run，写盘前会逐文件求值校验）
node scripts/i18n-insert-keys.mjs --list
node scripts/i18n-insert-keys.mjs --apply

# 5) 验收（两套 locale 的 key 集合 + 文案是否逐字来自产物）
node scripts/i18n-verify.mjs

# 6) 构建，并确认文案真的进了产物（构建不可复现，这是「逐字节比对」的替代）
npm run build && node scripts/verify-dist-coverage.mjs
```

`verify-dist-coverage.mjs` 会先把产物里的 `\xHH` / `\uHHHH` 转义解回来再比 —— Terser 对
非 ASCII 是两种写法混用的，按 `\uXXXX` 去猜必然误报（踩过）。

分语言 chunk 号：zh-CN=`8488`、en-US=`5442`、zh-TW=`3744`、ja-JP=`7018`、ko-KR=`1900`、
ru-RU=`7121`、fa-IR=`6015`、vi-VN=`7300`；auth 集统一在 `8153`。

## 插入器的几个取舍（都有原因）

- **定位靠花括号配对 + 深度，不按缩进猜**。同名块命中多处时取**最后一个** —— 那是运行时胜出的
  （`vi-VN.js` 的 `profile` 就有两块，往第一块里塞会被静默覆盖）。
- **缩进宽度、换行风格（LF/CRLF）、BOM 全部从目标文件自身探测**。主集是 LF+4 空格、auth 集是
  CRLF+2 空格，写死任何一个都会毁掉另一个的 diff。
- **写盘前先求值**：剥掉 `import`、`SITE_CONFIG.*` 占位、`export default` 换 `return`，
  然后校验「新 key 全在、旧 key 一个不少、旧值一个不变」；任一不过就整文件跳过、绝不落盘。
- **值一律逐字取自产物 JSON**；`«expr»`（产物里是 `SITE_CONFIG.siteName` 这类非字面量的）跳过并报告，
  不猜、不静默丢。
- 边界情形：目标块最后一个条目没有尾逗号时补一个；空块直接写 `key: { … }`；同一位置的多条插入合并成一次，
  守卫逗号只加一次。

## 踩过的坑（别重犯）

- **别按固定缩进去数顶层键**。各语言文件的缩进并不统一（fa-IR 是 2 空格，en-US/vi-VN/zh-CN 在 2 空格处
  一个键都没有），按缩进数会误报「有重复顶层键」。可信信号只有一个：求值后扁平 key 集合的对比。
- **写脚本别用 bash heredoc**：`\\` 会被折成 `\`，`\uXXXX` 会被吃掉。含反斜杠的脚本一律用文件写。
- **产物是单行压缩**：`grep -bo` 拿字节偏移 + `dd` 切片，或者用 `node` 读进来按**码元**偏移切
  （两者不是一回事，混用会切错位置）。
- **`chunk 8153` 里的取值**有非字面量（`o.SITE_CONFIG.*`），提取时用 Proxy 兜住并标成 `«expr»`，
  不要当成普通字符串。

## 现状

- 批 0：8 语言 key 集合对齐（补齐各语言缺的旧键）
- 批 1：新功能文案搬运完成 —— 主集 +80/语言、auth 集 +73/语言，`i18n-verify.mjs` 全绿
- 批 2 起是组件移植（随机密码卡、售后群绑定、两步验证、OAuth 入口、共享套餐进度、品牌落地页），
  文案直接引用这里搬进来的 key
