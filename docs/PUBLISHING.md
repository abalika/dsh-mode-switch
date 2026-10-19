# 发布到 GitHub

先阅读 [验证记录](REVIEW.md) 和 [贡献指南](../CONTRIBUTING.md)。项目仓库为 [abalika/dsh-mode-switch](https://github.com/abalika/dsh-mode-switch)，分发 DeepSeek Harness Desktop 社区插件源码和安装包。

1. 在开发目录运行 `npm run check:release`、`npm run release:source`。
2. 打开输出的 **Clean source folder**，检查其中的文件。只把这个目录中的内容作为仓库源码；不要上传整个开发目录、`backup/`、桌面安装目录或个人 DSH 配置。
3. 在干净源码目录提交到项目仓库；第一次发布时先建立空仓库。简介可写：`Switch between Harness and DeepSeek Chat in DeepSeek Harness Desktop.`
4. 检查暂存文件清单，并为该仓库设置 GitHub 提供的隐私邮箱后提交和推送。不要把本机用户名或私人邮箱写入公开提交。

```sh
git init -b main
git add .
git commit -m "Release DSH Mode Switch 0.2.1"
```

推送后检查 Actions 结果。未通过前不要把版本描述为跨平台完整验证。确认无误再创建 `v0.2.1` Release，可附上 `npm pack --ignore-scripts` 生成的插件 `.tgz` 和 SHA256 校验值。说明支持的桌面版本、Windows 可选登录补丁和已知限制。

仓库根目录应直接有 `README.md`、`package.json`、`lib/` 等源码，而不是只有压缩包。保留 MIT 许可和第三方声明。截图使用全新的演示数据，避免展示头像、账户名、聊天标题、文件路径和会话内容。

请勿将原型 0.1.1、本机备份的 `app.asar`、原始上游桌面二进制或浏览器用户资料附在公开 Release 中。
