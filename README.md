# YouTube Music Enhance - Native UI Stable v2.3

适用于 Egern。功能范围固定为：去除播放广告、启用后台播放。不会改写首页、搜索、歌词、评论、歌单、账号设置、画中画或锁屏媒体信息。

## 安装

1. 在 Egern 中停用并删除旧版 `YouTube Music Enhance - Native UI Stable`。
2. 打开本仓库中的 `YouTube-Music-Enhance.yaml`，复制 Raw 链接。
3. 进入 Egern「工具 → 模块」，点击右上角 `+`，粘贴 Raw 链接并启用模块。
4. 确认 Egern 的 MITM CA 已安装并信任，然后重启 Egern 隧道。
5. 强制结束 YouTube Music，再重新打开。原账号通常会直接恢复；若 App 此前已清掉会话，再登录一次。

YAML 使用完整的 GitHub Raw 地址加载 `scripts/ytm-response-v2.2.js`，无需单独导入 JS。

## v2.3 修复

- `player` 与 `get_watch` 完全直连，不再反序列化、重写播放响应。
- 保留歌曲标题、歌手、封面等 iOS 系统媒体元数据，修复灵动岛显示为通用音频控件。
- 继续处理 `browse`、`next` 页面广告与 `account/get_setting` 后台播放设置。

## v2.2 修复

- 撤下会造成新版 YouTube Music 卡住的 `initplayback/Onesie` 请求改写。
- 移除 `*.googlevideo.com` MITM 和第三方 Worker 依赖。
- 仅处理 YouTube 自身的页面、播放和后台播放设置响应。
- 使用新脚本文件名绕过 Egern 的旧脚本缓存。

## 早期修复

- 删除 `player/get_watch -> stream.maasea.workers.dev` 的跨域 307，账号鉴权留在 Google 原域名。
- 同时支持 `youtubei.googleapis.com` 与新版 `youtubei-att.googleapis.com`。
- 使用 Egern 原生 `ctx` 脚本接口处理二进制 Protobuf。
- 不再强制注入画中画能力，避免黑屏、只有声音或小窗转圈。
- 修改响应正文时清理旧的 `Content-Length` 与 `Content-Encoding`，避免正文长度不一致。
- 远程脚本改用绝对 Raw 地址，避免 Egern 将相对路径识别成本地文件。

## 已验证

- 2026-09-06 使用 YouTube Music iOS 9.35 客户端参数取得实时 `player` Protobuf 响应，并完成本机转换。
- `youtubei.googleapis.com`、`youtubei-att.googleapis.com` 两条接口均通过。
- 未压缩与 gzip 响应均通过；转换结果一致。
- 登录、搜索、歌词与评论接口保持 Google 原链路。

## 文件

- `YouTube-Music-Enhance.yaml`：Egern 模块。
- `scripts/ytm-response-v2.2.js`：响应去广告与后台播放处理。

响应处理逻辑基于 Maasea/sgmodule（Apache-2.0），外层适配与功能收敛针对 Egern 完成。
