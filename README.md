# YouTube Music Enhance - Native UI Stable v2.4

适用于 Egern。恢复播放去广告和后台播放，同时保留登录状态、灵动岛、锁屏歌曲名称/歌手/封面、原生歌词、评论、搜索与歌单。

## 安装

1. 在 Egern 中删除旧版模块。
2. 使用下面的地址重新导入：
   `https://raw.githubusercontent.com/Mianmianchen/ytm-enhance-egern/main/YouTube-Music-Enhance.yaml?v=2.4`
3. 确认模块名称末尾显示 `v2.4`。
4. 重启 Egern 隧道，强制结束并重新打开 YouTube Music。

## v2.4 修复

- 恢复对 `player` 与 `get_watch` 的处理，使播放去广告和后台播放重新生效。
- 新增 `scripts/ytm-response-v2.4.js`，不再把完整播放响应反序列化后重新生成。
- 仅在原始 Protobuf 中删除广告字段，并覆盖后台播放权限。
- 所有未知字段及媒体元数据保持原始字节，避免灵动岛丢失标题、歌手和封面。
- 不处理 `initplayback`，不 MITM `*.googlevideo.com`，避免播放转圈。
- 解析或协议异常时自动透传原响应，避免阻断播放。

## 文件

- `YouTube-Music-Enhance.yaml`：Egern 模块。
- `scripts/ytm-response-v2.4.js`：播放响应字节级补丁。
- `scripts/ytm-response-v2.2.js`：页面广告与设置响应处理。

字段依据 Maasea/sgmodule 的 YouTube Protobuf 定义；v2.4 的播放响应写回方式为 Egern 专用实现。
