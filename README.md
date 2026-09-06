# YouTube Music Enhance - Native UI Stable v2

适用于 Egern。功能范围固定为：去除播放广告、启用后台播放。不会改写首页、搜索、歌词、评论、歌单、账号设置、画中画或锁屏媒体信息。

## 安装

1. 在 Egern 中停用并删除旧版 `YouTube Music Enhance - Native UI Stable`。
2. 打开本仓库中的 `YouTube-Music-Enhance.yaml`，复制 Raw 链接。
3. 进入 Egern「工具 → 模块」，点击右上角 `+`，粘贴 Raw 链接并启用模块。
4. 确认 Egern 的 MITM CA 已安装并信任，然后重启 Egern 隧道。
5. 强制结束 YouTube Music，再重新打开。原账号通常会直接恢复；若 App 此前已清掉会话，再登录一次。

Egern 会根据 YAML 中的相对路径自动加载 `scripts/ytm-response.js` 和 `scripts/ytm-request.js`，无需分别导入 JS。

## 本版修复

- 删除 `player/get_watch -> stream.maasea.workers.dev` 的跨域 307，账号鉴权留在 Google 原域名。
- 同时支持 `youtubei.googleapis.com` 与新版 `youtubei-att.googleapis.com`。
- 使用 Egern 原生 `ctx` 脚本接口处理二进制 Protobuf。
- `initplayback` 只有在缓存密钥校验通过时才处理，并对目标 URL 完整编码。
- 不再强制注入画中画能力，避免黑屏、只有声音或小窗转圈。
- 不拦截 `browse`、`next`、`search`、`guide`、`account/get_setting`，减少歌词、评论、搜索和歌单异常。
- 修改响应正文时清理旧的 `Content-Length` 与 `Content-Encoding`，避免正文长度不一致。

## 已验证

- 2026-09-06 使用 YouTube Music iOS 9.35 客户端参数取得实时 `player` Protobuf 响应，并完成本机转换。
- `youtubei.googleapis.com`、`youtubei-att.googleapis.com` 两条接口均通过。
- 未压缩与 gzip 响应均通过；转换结果一致。
- `log_event` 的账号头与正文保持不变，只移除已失效的压缩/热配置头。
- `initplayback` 的完整目标 URL 可无损编码、还原；缺少密钥时会干净回退到普通 `player`。
- 登录、搜索、歌词、评论、歌单及账号设置接口均不会命中任何改写规则。

## 文件

- `YouTube-Music-Enhance.yaml`：Egern 模块。
- `scripts/ytm-response.js`：播放响应去广告与后台播放处理。
- `scripts/ytm-request.js`：新版 `initplayback` 与密钥同步处理。

响应处理逻辑基于 Maasea/sgmodule（Apache-2.0），外层适配与功能收敛针对 Egern 完成。
