# 后端契约探活（批 2，2026-10-02）

来源：直接读 `E:\v2board` 的源码（路由 + 控制器），不是猜的。**发现不一致时按后端改，不按产物改。**

## `POST /user/resetPassword` —— 随机密码（批 2 用）

路由：`app/Http/Routes/V1/UserRoute.php:21` → `V1\User\UserController@resetPassword`

| 项 | 实际契约 |
| --- | --- |
| 入参 | `current_password`（required, string） |
| 成功 | `{ data: { password: <64 位随机串>, length: 64 } }` |
| 密码构成 | `PasswordPolicyService::generate()`——大小写字母 + 数字，长度 `PasswordPolicyService::LENGTH = 64` |
| 错误 | `abort(500, ...)`：用户不存在 / 旧密码错误 / 保存失败 |
| 限流 | 同一用户连续错 5 次 → 锁 60 分钟，报「密码错误次数过多，请 60 分钟后再试」 |
| 副作用 | **成功后 `AuthService::removeAllSession()` —— 所有会话立刻失效**；并 `markSatisfied()` 关掉「请改随机密码」提醒 |

前端对应（已实现）：`src/api/user.js` 的 `resetPassword(data)`；卡片成功后先 `logout()` 清本地态、**不跳转**，等用户点「我已保存，重新登录」再 `router.push('/login')`。

## `POST /user/changePassword` —— 已废弃的「自己改密码」

路由：`UserRoute.php:20`，控制器里写明：

> 自己敲的密码按策略不合规，重新开始提醒。**这个接口的 UI 已经从三个主题里撤掉了**，保留它只为兼容可能存在的第三方客户端。

因此 signature 产物里 `profile.changePassword` / `profile.security` 全部消失、`changePassword` API 也不再被调用 —— 批 2 据此把源码里的「修改密码」入口改成了随机密码卡（含头像菜单项与 `?openPasswordModal=true` 深链，深链改为滚动到 `.password-reset-card`）。
`src/api/user.js` 的 `changePassword()` 保留（后端仍留着接口），但前端已无调用点。

## `GET /user/subscription/fetch` —— 用户的订阅列表（批 3 用）

路由：`UserRoute.php:24` → `V1\User\SubscriptionController@fetch`

返回 `{ data: [ { id, plan_id, plan_name, status(active|expired|…), transfer_enable, u, d, expired_at, device_limit, group_id, subscribe_url, is_primary, auto_renewal } ] }`；
共享套餐组会额外带 `shared_subscription`、`traffic_log_available:false`。服务未开启时返回 `{data: []}`。

## 售后群绑定（批 3 用）

| 接口 | 契约 |
| --- | --- |
| `GET /user/telegram/binding` | `{data: {enabled, chat_id, binding: null \| {id, subscription_id, telegram_user_id, telegram_username, status, invalid_reason, bound_at, last_checked_at}}}`；`enabled` = 功能开着且服务可用 |
| `POST /user/telegram/binding/prepare` | 入参 `{subscription_id}`；返回 `{data: {bot_username, binding_url, expires_at, subscription_id, chat_id}}`。**nonce 在服务端只缓存 600 秒**；错误：503 功能关/未就绪、403 不是本人订阅、404 订阅不存在、422 订阅已失效 |
| `POST /user/telegram/binding/revoke` | 返回 `{data: true\|false}` —— **没有可撤销的绑定时是 `false` 但 HTTP 仍是 200**，前端必须看这个值；成功会收回没用完的一次性邀请链接，并把状态置 `revoked` / `invalid_reason='user_revoked'` |

`invalid_reason` 取值：`user_revoked`、`subscription_changed`、`telegram_username_changed`、`binding_group_changed`、`binding_feature_disabled`，其余归 `unknown`（产物就认这五种 + unknown，源码照此实现）。

## 两步验证（批 4）

### 个人中心（已实现）
| 接口 | 契约 |
| --- | --- |
| `GET /user/2fa/status` | `{data: {enabled, issuer, account}}` |
| `POST /user/2fa/setup` | `{data: {issuer, account, manual_key, otpauth_uri, qr_code}}`；`qr_code` 是 data URL，后端渲染器不可用时为 `null`（前端回落到手动密钥）；已启用时报「二步验证已经启用」 |
| `POST /user/2fa/confirm` | 入参 `{code}` → `{data: {enabled: true, recovery_codes: [...]}}`，**成功后所有会话失效** |
| `POST /user/2fa/disable` | `{current_password, code \| recovery_code}` → `{data: true}`，会话失效 |
| `POST /user/2fa/recovery-codes/regenerate` | `{current_password, code \| recovery_code}` → `{data: {recovery_codes: [...]}}`，会话失效 |

`current_password` 由控制器先校验（错则 500「当前密码不正确」）；`code` 与 `recovery_code` 二选一，服务端哪个有效用哪个。

### 登录侧（**尚未实现**，下一步）
| 接口 | 契约 |
| --- | --- |
| `POST /passport/auth/login` | 成功响应里可能带 `two_factor_required`（含 `challenge`、`recovery_allowed`、`expires_in`）或 `two_factor_setup_required`（含 `setup_token`） |
| `POST /passport/auth/verify2fa` | `{challenge, code \| recovery_code}` → `{data: authData}`（这一步才算登录完成） |
| `POST /passport/auth/2fa/setup` | `{setup_token}` → 二维码/手动密钥；**仅管理员/员工**（`is_admin \|\| is_staff` 且 `requiresSetup`），否则 403 |
| `POST /passport/auth/2fa/confirm` | `{setup_token, code}` → `authData + recovery_codes` |

产物侧行为（已从 6409 chunk 读出，实现时照抄）：登录成功 → 若带两个标记之一就切到「两步验证」步骤；
`two_factor_setup_required` 时先 `2fa/setup` 拿二维码；提交后 `verify2fa`/`confirm` → 成功再走
`consumePendingPurchase()`（登录前在落地页点的购买意图，见 `src/utils/pendingPurchase.js` 的 `readPendingPurchase/clearPendingPurchase`）→ 有单就去 `/payment`，否则 `/dashboard`。
界面文案用批 1 搬进 auth 集的 `auth.twoFactor.*`（28 条：title/subtitle/setupTitle/setupSubtitle/code/
codePlaceholder/recoveryCode/recoveryCodePlaceholder/useRecovery/useAuthenticator/issuer/account/manualKey/
manualOnly/scanQr/verify/back/expiresIn/enterSixDigits/enterRecovery/invalidCode/expired/tooManyAttempts…）。

## OAuth 登录入口（**尚未实现**，批 5）
产物里是 `OAuthButtons` + `TelegramLoginWidget`（chunk 6409），接口 `GET /passport/oauth/{provider}/state`、
`POST /passport/oauth/complete`（`PassportRoute.php:42-47`，另见 `CommController` 返回的 `oauth`
开关：google / github / telegram + `telegram_bot_username` / `telegram_login_domain`）。
`oauth_register_only` 打开时注册页只留 OAuth 区。
