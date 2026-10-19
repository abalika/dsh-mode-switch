# 安装、登录保存与回退 / Installation and rollback

命令用于 Windows PowerShell。路径是占位示例，请改成自己的实际目录。需要 Node.js 22+ 和受支持 DSH Desktop。使用当前桌面安装**自带的 CLI**，沿用自己的 `DSH_HOME` 环境设置，不要改用另外从 npm 安装的 CLI 操作桌面 profile。

## 生成并安装插件

进入源码目录运行（不需要 `npm install`）：

```powershell
npm pack --ignore-scripts
$Package = (Resolve-Path '.\dsh-mode-switch-0.2.1.tgz').Path -replace '\\', '/'
$DshApp = 'C:\path\to\DeepSeek Harness'
$Dsh = Join-Path $DshApp 'resources\runtime\cli\bin\dsh.cmd'
```

若安装中没有该 CLI 路径，请从桌面应用的命令管理菜单定位桌面版 `dsh`，参考[官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md)。不要猜测其他安装的路径。

先启动桌面应用完成初始化，再用应用菜单**完全退出**（关闭窗口可能只是隐藏）。安装：

```powershell
& $Dsh plugin --profile desktop add "file:$Package" --ignore-scripts
```

重新启动该安装的 DSH Desktop。品牌下方应出现“切换到 DeepSeek”，切换后显示“切换到 Harness”。来回切换应保留两侧页面。

更新已有插件时，完全退出应用后执行：

```powershell
& $Dsh plugin --profile desktop remove dsh-mode-switch
& $Dsh plugin --profile desktop add "file:$Package" --ignore-scripts
```

其他插件报版本兼容错误时，请单独处理，不要关闭整个 profile 的版本检查。

## 可选：跨重启保留网站登录

这一步明确修改桌面 `app.asar`，普通插件安装不会自动执行。先运行只读检查（应用运行时也可）：

```powershell
$Archive = Join-Path $DshApp 'resources\app.asar'
node .\desktop\persistent-session.cjs --archive $Archive --check
```

确认受支持版本后，完全退出桌面应用，再安装并检查：

```powershell
node .\desktop\persistent-session.cjs --archive $Archive
node .\desktop\persistent-session.cjs --archive $Archive --check
```

新安装应显示 `status: patched`、`backupStatus: verified`、`restoreAvailable: true`。重复执行不重复修改。运行中、未知版本、损坏文件、目录链接会被拒绝；脚本不关闭进程、不自动提权、不修改系统设置。

原始程序及清单位于 `resources\app.asar.dsh-mode-switch-backup\`，请保留，勿上传 GitHub。恢复要求当前完整归档哈希与安装时一致，以免覆盖后续更新。这些是桌面程序恢复文件，不是网站账号备份。

**旧原型迁移：**此前用 0.1.x 打过补丁时，可能显示 `patched`、`backupStatus: missing`，表示新版位置和格式的原始备份不存在，不能自动回退。保留原型的备份及恢复工具，或恢复官方原始程序后再安装补丁。不要把修改后的程序冒充原始备份。

重启后由用户自行登录网站。首次使用持久分区可能需登录一次。随后正常退出并重启验证。网站过期仍需重登；多套 DSH 配置共用同一 Electron 用户数据目录时，也会共用网站登录。

## 更新与故障

- 升级桌面后先运行 `--check`。未知版本需等待适配，不要手动跳过哈希校验。
- 网页加载失败或崩溃时使用“重新加载”，也可返回 Harness。下载/权限限制不等于登录失效。
- 侧栏折叠或无法定位品牌时使用备用入口：Harness 左上角，网页右上角。正常网页入口在其自身 LOGO 下方；加载失败时底部显示恢复操作。布局遮挡请提供版本和脱敏截图。
- 提示已有操作/遗留锁时，先确认无补丁进程且应用已完全退出，检查归档同级的 `app.asar.dsh-mode-switch.lock`。只有确认是中断操作遗留的空锁后，手动移除该文件再检查；保留备份目录。
- 权限不足时使用有写权限的桌面安装。工具不自动提权，不要放宽系统安全设置。

## 卸载与回退

完全退出应用后：

```powershell
& $Dsh plugin --profile desktop remove dsh-mode-switch
```

如需恢复桌面原始程序，另外执行：

```powershell
node .\desktop\persistent-session.cjs --archive $Archive --restore
```

卸载/回退不删除网站资料。需退出账号时，在卸载前通过网站正常退出。更换插件 UI 版本只需 remove/add 对应 `.tgz`，不需要恢复登录补丁。用户自行保留的旧包也可这样重新安装。

## English quick reference

Use your initialized desktop's bundled CLI and existing `DSH_HOME`. Fully quit from the application menu before installing/removing the plugin or writing the optional patch. Replace the placeholder path. Pack using `npm pack --ignore-scripts`, then run `plugin --profile desktop add "file:<absolute-package-path>" --ignore-scripts`. Restart.

The optional tool accepts `--archive <resources/app.asar>` with `--check` (read-only) or `--restore`. Fresh installation must report a verified backup and `restoreAvailable: true`. Legacy 0.1.x backups are not imported automatically; retain the matching original/tool or restore an official original first. Unknown builds, running apps and changed restore targets are refused. Uninstalling does not erase website storage; use website logout if needed.
