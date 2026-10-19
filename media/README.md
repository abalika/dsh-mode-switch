# 演示素材 / Demo assets

这些图片、GIF 和配套 MP4 是**隔离界面演示，不是生产桌面或已登录网站的录屏**。页面布局、任务、聊天文字、草稿均为合成内容；品牌以文字表示。画面一直保留演示标识。

`create-demo.cjs` 在全新 Playwright 上下文中运行未修改的 `lib/client.js`，模拟宿主浏览器桥接接口。Harness 和网页夹具分别位于两个测试页面，成片按当前模式切换画面。HTTP 请求全部由本地路由拦截，未访问真实账号、配置、Cookie 或聊天记录，也未修改桌面程序。

脚本断言返回时 Harness 草稿不变、网页草稿不变、浏览器租约只获取一次。它展示切换交互，**不用于证明真实网站的登录或跨重启持久化**；这些功能的实现与验证见 [主文档](../README.md) 和 [验证记录](../docs/REVIEW.md)。真实界面外观随宿主和网站版本变化。

- `demo-harness.png`：Harness 侧入口示意。
- `demo-deepseek.png`：网页侧返回入口示意。
- `demo.gif`：20 秒字幕演示。

在装有 Edge、FFmpeg 和项目开发依赖的 Windows 环境中，从项目根目录运行：

```powershell
node media/create-demo.cjs
```

可用环境变量 `DSH_TEST_BROWSER_CHANNEL` 选择 Playwright 浏览器通道，`FFMPEG_BIN` 指定 FFmpeg。26 秒无声字幕 MP4、封面及中间帧生成于被 Git 忽略的 `release/promotion-v0.2.2/`；不会加入插件安装包。重新生成只会写入这些演示文件。

Images and animations are labeled synthetic UI illustrations. They execute the original plugin against local fixtures and a mocked desktop bridge, with all HTTP intercepted. They are not production desktop footage, do not use a signed-in account, and do not demonstrate cross-restart login persistence. Text wordmarks do not imply official endorsement.
