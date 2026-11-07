# Windows 安装包与 GitHub 发布

## 结论与当前状态

可以制作标准 Windows 安装包。桌面端是 Electron 工程，`skylens-desktop-source/package.json` 已配置 electron-builder 的 NSIS 目标，无需重写应用。

当前目录已生成 Windows Setup.exe、Portable.exe，另有 Windows ZIP、解压版和 Android APK。安装包生成不代表已完成安装、运行与卸载验收，发布前仍需执行下述检查。

## 发布说明中应列出的导航问题

- **交叉口转向限制识别不完整**：目前不能准确判断道路交汇处是否允许转向，可能规划出跨越实线等不符合游戏道路规则的路线。
- **公共交通行驶方向尚未区分**：目前不能区分线路沿道路运行的正向与逆向，可能影响乘车方向、站点衔接及换乘方案的准确性。

导航结果仅供参考，请结合游戏中的道路标线、转向规则和实际线路方向核对。发布说明同时保留[上游 SKYLENS MAPS](https://github.com/ganjanggejang/skylens-maps) 来源，并引导读者参考上游 README 中的地图导出与纯网页版使用方法。

## 如何生成安装包

在 Windows PowerShell 中执行（建议使用当前受支持的 Node.js LTS，并确保 Node.js/npm 已加入 PATH）：

```powershell
cd D:\skyline_map\skylens-desktop-source
npm install
npm test
npm run dist
```

只有测试通过后再执行打包。首次运行需要联网下载 npm 依赖、Electron 和 NSIS 打包工具。若提示依赖要求更高的 Node.js 版本，应按实际报错升级构建环境。

当前版本 `0.1.0` 对应的预期输出：

```text
skylens-desktop-source/release/
  SKYLENS Desktop-0.1.0-Setup.exe
  SKYLENS Desktop-0.1.0-Portable.exe
```

只需要安装向导版时可运行：

```powershell
npx electron-builder --win nsis --x64
```

继续保留现有 ZIP 形式则运行 `npm run dist:zip`。发布时以磁盘上实际生成的文件为准。

## 用户获得的体验

- 双击 Setup.exe，按向导选择安装目录并完成安装。
- 默认按当前用户安装，通常无需管理员权限；安装目录权限或系统策略可能影响这一点。
- 安装后通过快捷方式启动；可在 Windows“设置 → 应用”中卸载。
- Electron 运行时随安装包分发，使用者不用安装 Node.js。

这些行为由现有 `nsis.oneClick=false`、`allowToChangeInstallationDirectory=true`、`perMachine=false` 配置提供。具体选项见 [electron-builder NSIS 文档](https://www.electron.build/nsis/)。

当前配置没有启用代码签名，生成安装包不会自动消除 Windows 的未知发布者或 SmartScreen 提示。代码签名需要单独配置证书或签名服务。

## 发布前实际验收

建议用一台没有开发环境的 Windows 10/11 x64 电脑或虚拟机，完成一次真实流程：

1. 普通用户运行安装包，选择一个带空格的安装路径，完成安装。
2. 从快捷方式启动，导入一份已知可用的快照，检查地图、建筑详情、统计和导航。
3. 关闭应用再打开，确认地图库仍可读取。
4. 断网后重新打开已导入地图，检查离线浏览。
5. 用相同账号覆盖安装新版，检查地图库与设置。
6. 在系统设置中卸载，确认程序及快捷方式移除。先备份地图，并记录卸载后用户数据是否保留。

不应将开发机上 `npm start` 能运行当作安装包验证结果。发布说明中的“已测试系统”应只填写实际测试过的系统。

## GitHub 上分别放什么

| 位置 | 内容 |
| --- | --- |
| 源码仓库 | 两个源码目录、根 README、docs、许可证、构建配置、测试 |
| Releases 附件 | Windows Setup.exe、便携版或 ZIP、Android APK |
| 视频平台 | 完整介绍视频；把公开观看链接放进 README |
| 本地保留 | 个人地图、原始导出、node_modules、Gradle 缓存、构建中间文件、签名密钥 |

本次添加了根目录 `.gitignore`。使用 Git 提交时它会排除包和常见构建文件；**浏览器手动上传文件时不能依赖它替你筛选**，请自行只选择源码和文档。它也不会移除已经提交过的文件。

当前 Windows ZIP 约 158 MiB，超过 GitHub 普通仓库的单文件 100 MiB 上限，应作为 Release 附件上传。GitHub 也建议通过 Releases 分发大型二进制文件。参见 [GitHub 大文件说明](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。

建议上传步骤：

1. 创建 GitHub 仓库，上传源码、文档、许可证；保留两个源码目录原有的许可和第三方声明。
2. 创建版本发布，例如标签 `v0.1.0`，说明支持平台、导入格式和已知限制。
3. 将实际构建的安装包、已有 Windows ZIP、Android APK 作为附件上传。没有构建和验收的文件不要写成已提供。
4. 录制并发布视频后，在根 README 的“界面预览”附近替换视频链接，并添加实际截图。

可选：发布附件前用 `Get-FileHash -Algorithm SHA256 -LiteralPath '实际安装包路径'` 生成校验值，附在发布说明中。

## 介绍视频放在哪里

建议把完整介绍视频上传到 B 站或 YouTube，在 README 中放“观看演示”链接；源码仓库保留封面截图即可。录制口播稿只保存在本地，不提交。

如果想在 GitHub 内放短演示，可在 Issue/PR 评论框上传 MP4 等视频附件，再使用生成的链接。GitHub 当前文档给出的附件限制为：免费方案视频 10 MB、付费方案视频 100 MB；为兼容性建议使用 H.264。完整长视频通常更适合视频平台。参见 [GitHub 附件说明](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)。

视频文件不必作为普通源码文件提交。README 中的最终写法：

```markdown
[观看 SKYLENS 实际演示](替换为实际视频页面地址)
```

源码、文档和安装包分别发布；不要将本地录制稿或个人城市快照加入仓库和 Release 附件。
