# DSH Mode Switch

[English](README.en.md) · [下载插件](https://github.com/abalika/dsh-mode-switch/releases) · [安装与回退](docs/INSTALL.md) · [实现与边界](docs/ARCHITECTURE.md) · [验证记录](docs/REVIEW.md)

为 **DeepSeek Harness Desktop** 添加同窗口的 Harness / DeepSeek 网页切换。按钮分别位于 Harness 和 DeepSeek 网页自身的左上角 LOGO 下方；不增加重复页头，返回时保留 Harness 的会话和草稿。

这是独立社区插件，与 DeepSeek 官方没有隶属或背书关系。网页及账号服务由 DeepSeek 提供；插件不是模型 API，也不代替网站登录。界面按钮目前为中文。

## 功能

- 单个“切换到…”按钮，不使用悬浮双按钮条。
- 网页模式只在原 LOGO 下增加入口，不复制品牌；正常使用时隐藏加载工具条。
- 点击 DeepSeek 后才创建网页；来回切换不重建两侧页面。
- 加载失败或崩溃时可重新创建受控网页。
- 可选 Windows 补丁，让网站使用持久分区，减少重启后反复登录。
- 不读取或上传密码、Cookie、聊天记录，不提供账号中转服务。

## 兼容性

| 项目 | 支持范围 |
| --- | --- |
| 桌面版本 | 0.2.0-rc.2 / 0.2.1-rc.2 |
| 安装 | 桌面版自带 DSH CLI 安装本地 `.tgz` |
| Node.js | 22+ |
| 登录保存补丁 | Windows；精确校验主程序代码，未知版本拒绝修改 |
| 网页版 Harness | 没有桌面浏览器桥接接口时不显示入口 |

品牌下方暂无直接公开插槽。Harness 适配上述版本的界面结构；网页模式仅在 `https://chat.deepseek.com` 的公共 LOGO 布局中插入按钮，不读取账号、输入框或聊天内容。无法定位 LOGO、侧栏折叠或登录页面没有侧栏时，显示紧凑备用入口（Harness 左上角，网页右上角）。宿主或网站升级可能需要重新适配。下载、麦克风、摄像头和部分弹窗流程仍受宿主限制。

## 安装

下载或克隆源码，在项目目录运行 `npm pack --ignore-scripts`。初始化并完全退出 DSH Desktop，再用它自带的 CLI 将生成的 `dsh-mode-switch-0.2.1.tgz` 添加到 `desktop` profile，重启应用。

[完整安装命令](docs/INSTALL.md) 包含 CLI 定位、可选登录保存、更新和卸载。普通安装不需要开发依赖。`private: true` 防止意外发布到 npm，不影响本地打包和 GitHub 分发。

## 登录保存

插件本身在模式切换时保留网页。**跨应用重启**保存登录，需要明确选择运行 `desktop/persistent-session.cjs`；插件不会自行修改桌面程序。

它只为本插件工作区使用 `persist:dsh-deepseek-chat-v1`，其他内嵌浏览器仍使用临时分区。Cookie、localStorage、IndexedDB 由 Electron 保存在本机用户数据目录。首次更换分区、网站使登录失效、主动退出账号或清理数据后仍可能需要重新登录。

补丁保留原始程序并校验回退目标。应用升级可能覆盖补丁，请先运行只读检查，勿强行修改未知版本。不要把备份和个人配置上传到仓库。

## 开发与发布

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run check:release
npm run release:source
```

[贡献指南](CONTRIBUTING.md) 包含可选 Electron 集成测试。源码发布使用允许清单，排除本机路径、备份、桌面程序及测试资料。自动扫描不能代替发布前人工检查。

维护者发布新版本时请按 [GitHub 发布说明](docs/PUBLISHING.md) 使用干净源码目录。

项目代码使用 [MIT](LICENSE)。上游代码片段、品牌和测试工具见 [第三方声明](THIRD_PARTY_NOTICES.md)；商标权不因代码许可转让。
