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

## 批 4 起要用到的（已确认路由存在，细节到时再核）

- `GET /user/2fa/status`、`POST /user/2fa/setup|confirm|disable|recovery-codes/regenerate`（`UserRoute.php:29-33`）
- `POST /passport/auth/2fa/setup|confirm`、`POST /passport/auth/verify2fa`（`PassportRoute.php:34-36`）
- `GET /user/getActiveSession`、`POST /user/removeActiveSession`（源码里已有）
