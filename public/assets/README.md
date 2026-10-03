# 面板级脚本（打进主题产物）

这两个文件来自 v2board 仓库的 `public/assets/`，**这里是副本**：

- `telegram-bind-widget.js` —— 强制绑定 Telegram 弹窗 + Telegram 验证码找回密码
- `telegram-register-widget.js` —— Telegram 机器人注册（/regedit + 邮箱验证码）的网页承载

为什么放一份在这里：前后分离部署时，站点根是主题产物的目录，`/assets/` 下没有这两个文件
（线上表现为 404，注册页会继续提交已经被移除的 /passport/auth/register）。

**源头仍是 v2board 仓库**。那边的这两个文件更新后，要重新复制到本目录并重新构建，
否则主题产物里的还是旧版。
