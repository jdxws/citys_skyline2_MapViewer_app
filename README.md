<p align="center">
  <img src="skylens-desktop-source/assets/icon.png" width="128" height="128" alt="SKYLENS icon">
</p>

<h1 align="center">SKYLENS Map Viewer</h1>

<p align="center">
  在游戏之外，离线查看《城市：天际线 2》的城市地图
</p>

<p align="center">
  Windows x64 · Android 8.0+ · 完全离线 · GPL-3.0-only
</p>

---

## 项目简介

**SKYLENS Map Viewer** 是基于 SKYLENS MAPS 开发的《城市：天际线 2》（Cities: Skylines II）离线地图查看器，支持 Windows 和 Android，可浏览城市快照、建筑道路信息与城市统计，并提供实验性路线规划。客户端内仍使用 SKYLENS / SKYLENS Desktop 名称。

它用于打开 [SKYLENS MAPS](https://github.com/ganjanggejang/skylens-maps) 模组导出的城市快照，让你不需要进入游戏，也能在电脑或手机上浏览自己的城市。

项目提供 Windows 桌面版和 Android 手机版。两个客户端都内置地图页面，可以在本地加载城市快照，不需要连接互联网，也不需要上传自己的城市数据。

适合想在不启动游戏时查看路网、研究公交换乘、对照分区人口与用地，或者在手机上展示自己城市的玩家。它读取的是**导出时刻的城市快照**；城市发生变化后，需要重新导出和导入。它不能直接打开游戏存档，也不能编辑城市或把修改写回游戏。

**第一次使用：下载客户端 → 在游戏中导出快照 → 导入客户端 → 打开地图。**

- [Windows 安装包制作与 GitHub 发布说明](docs/发布与Windows安装包.md)

> 本项目是非官方社区项目，与 Paradox Interactive、Colossal Order 或 SKYLENS MAPS 原作者没有隶属关系。

## 项目来源与上游使用说明

本项目基于 [ganjanggejang/skylens-maps（SKYLENS MAPS）](https://github.com/ganjanggejang/skylens-maps) 开发，复用了其地图前端与城市数据格式，并在此基础上增加 Windows、Android 客户端及本项目列出的扩展功能。感谢原作者提供的地图展示与导出基础。

**地图文件的导出方法、原模组安装步骤，以及纯网页版的使用方式，请优先参考[上游仓库 README](https://github.com/ganjanggejang/skylens-maps#readme)。**

- **游戏内导出与浏览器查看**：上游“Install and use”说明了如何启用 Carto 和 SKYLENS MAPS、导出城市并在浏览器打开地图。具体步骤以与你安装版本对应的上游文档为准。
- **纯网页版操作**：地图浏览、对象详情、搜索与路线规划等原版功能见上游“Map features”。
- **本地运行纯网页版**：开发环境、导出数据准备与启动命令见上游“Develop locally”。本仓库的两个源码目录分别用于 Windows 和 Android 客户端。

上游游戏模组启动的本地地图服务依赖游戏和模组运行；本项目则将已导出的快照导入客户端，供退出游戏后离线查看。上游网页与本项目的扩展功能可能不同，请结合各自版本说明使用。

## 主要功能

- **离线地图查看**：无需启动游戏即可浏览城市地图。
- **地图快照导入**：支持快照 ZIP、已整理快照文件夹，以及桌面版支持的原始导出目录。
- **地图库管理**：导入、打开、重命名和删除地图；导入的是副本，不会修改原始文件。
- **多语言界面**：支持简体中文、한국어和 English，首次启动默认显示简体中文，可在侧栏切换。
- **地图图层控制**：分别查看建筑、道路、铁路、步道、水路、区域以及公交、火车、有轨电车、地铁、船舶、渡轮等交通图层。
- **建筑信息**：点击建筑可查看居民、住户、员工、年龄、性别比、工资等快照字段。
- **道路信息**：点击道路中心线可查看道路宽度、交通量、道路类别等属性。
- **单行道方向箭头**：在合适的缩放级别显示道路方向。
- **公共设施图标**：停车场、学校、警局、消防、医院、公园及公用设施等使用对应图标。
- **城市统计**：查看全市汇总和分区数据，包括居民、住户、员工、公司、平均年龄、性别比、利润、工资、面积和人口密度等。
- **用地统计**：按需统计住宅、商业、办公和工业等用地面积，避免地图打开时一次读取全部大文件。
- **驾车路线**：提供最快路线、里程最短路线和避开高交通量路段路线，并将道路 `Volume` 和信号灯节点计入预计时间。
- **公共交通路线**：提供少走路、少换乘和最短时间路线；支持公交、火车、有轨电车、地铁、船舶和渡轮。
- **地铁出入口**：导入快照时生成车站出入口索引，并根据入口、站内步行、线路和总耗时选择乘车方案。
- **高精度道路展示**：按需加载道路面轮廓，减少默认打开地图时的内存和等待时间。
- **Windows 与 Android 数据互通**：同一份已整理快照 ZIP 可以在两个客户端中导入。

## 界面预览

<!--
把截图放入 docs/screenshots/ 后，删除这段注释并替换为实际图片。
建议文件：
  docs/screenshots/map-overview.png
  docs/screenshots/building-details.png
  docs/screenshots/city-statistics.png
  docs/screenshots/navigation.png
  docs/screenshots/android.png

| Windows 地图总览 | 建筑与道路详情 |
| --- | --- |
| ![Windows 地图总览](docs/screenshots/map-overview.png) | ![建筑与道路详情](docs/screenshots/building-details.png) |

| 城市统计 | 路线导航 |
| --- | --- |
| ![城市统计](docs/screenshots/city-statistics.png) | ![路线导航](docs/screenshots/navigation.png) |

| Android 客户端 |
| --- |
| ![Android 客户端](docs/screenshots/android.png) |
-->

截图与演示视频将在录制后补充。

<!-- 视频发布后，在这里加入实际地址：[观看完整演示](实际视频页面地址)。 -->

## 下载与安装

安装包在仓库的 **[Releases](https://github.com/jdxws/citys_skyline2_MapViewer_app/releases)** 页面提供，与 Windows、Android 两个源码目录分开存放。

下载时按文件名选择：

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Windows 安装版 | [下载 Setup.exe](https://github.com/jdxws/citys_skyline2_MapViewer_app/releases/download/v0.1.0/SKYLENS%20Desktop-0.1.0-Setup.exe) | 安装向导版，可选择安装目录 |
| Windows 免安装版 | [下载 Portable.exe](https://github.com/jdxws/citys_skyline2_MapViewer_app/releases/download/v0.1.0/SKYLENS%20Desktop-0.1.0-Portable.exe) | 双击启动，无需安装 |
| Android | [下载 APK](https://github.com/jdxws/citys_skyline2_MapViewer_app/releases/download/v0.1.0/SKYLENS-Android-20261106-i18n.apk) | 传到手机后直接安装 |

### Windows

1. 推荐下载 `Setup.exe`，按安装向导完成安装后，通过快捷方式启动。
2. 也可以下载 `Portable.exe`，无需安装，双击即可启动。免安装版的地图和设置仍保存在当前 Windows 用户的数据目录中。
3. 首次运行如果出现 SmartScreen 提示，请先核对下载来源。当前打包配置未启用代码签名，因此 Windows 可能显示“未知发布者”。

支持 64 位 Windows 10/11。发行包已经包含 Electron 和运行所需文件，用户无需安装 Node.js。

### Android

1. 下载 APK 文件。
2. 在系统设置中允许当前文件管理器或浏览器“安装未知应用”。
3. 打开 APK 完成安装。

最低支持 Android 8.0（API 26）。如果设备上已经安装了旧测试版，可以优先尝试覆盖安装；卸载应用可能会同时清除应用内地图库，卸载前请先备份重要快照。

## 准备城市数据

查看地图前，需要先从游戏中导出一份城市快照。

1. 在《城市：天际线 2》中安装并启用 **SKYLENS MAPS** 模组。
2. 按模组说明生成城市快照。
3. 找到导出的 ZIP、`exported_files` 文件夹，或游戏目录中的 `ModsData/CityMap/snapshots/<id>`。
4. 把 ZIP 或文件夹传到目标设备。

桌面版可以自动整理原始 `exported_files`。Android 版目前只接受已经整理好的快照，因此原始导出目录建议先用 Windows 版导入，再把地图库中的快照重新打包为 ZIP 传到手机。

Windows 导入后，可在地图库位置找到相应快照：找到同级包含 `GeoJSON/`、`manifest.json`、`water-mask.png` 的目录，将该目录打包成 ZIP。不要只打包其中的 `GeoJSON/`，也不要将整个应用程序目录发到手机。快照不是 APK 的一部分，需另行传输和导入。

## 快速开始

### Windows

1. 打开 SKYLENS Desktop。
2. 点击“选择 ZIP… / 选择文件夹…”，或直接把文件拖进窗口。
3. 等待导入完成。
4. 在“我的地图”中点击“打开”。

地图库默认保存在：

```text
%APPDATA%\skylens-desktop\library
```

### Android

1. 打开 SKYLENS。
2. 点击“选择 ZIP…”或“选择文件夹…”。
3. 等待导入完成，大快照可能需要较长时间，请保持屏幕常亮。
4. 在“我的地图”中点击“打开”。

Android 11 及以上版本不允许直接选择“下载”等存储根目录或 `Android/data`。请选择其中的子文件夹，或者直接导入 ZIP。

### 支持的导入内容

| 内容 | Windows | Android |
| --- | :---: | :---: |
| 已整理快照 ZIP | 支持 | 支持 |
| 已整理快照文件夹 | 支持 | 支持 |
| `dist/data` 所在文件夹结构 | 支持 | 支持 |
| `ModsData/CityMap/snapshots/<id>` | 支持 | 支持，需是已整理内容 |
| 原始 `exported_files` | 支持，自动整理 | 暂不支持 |
| 包含多个快照的文件夹 | 支持 | 支持，批量导入 |

已整理快照通常应包含：

```text
GeoJSON/
manifest.json
water-mask.png
```

如果快照中有 `Network_Boundary.json`，应用会将其保留，用于按需开启“高精度道路”。如果只有普通中心线数据，地图的其他功能仍可正常使用。

## 地图操作

- 拖动地图可平移，滚轮或双指手势可缩放。
- 点击建筑、公共交通站点或道路中心线可查看属性。
- 左侧或侧栏中的“图层”用于控制各类地图要素。
- “公共交通”可以筛选不同交通方式和线路；选中线路后，地图会突出显示对应路线和站点。
- “地图工具”中的“城市统计”会打开全市概览，并可按需计算各分区用地面积。
- “高精度道路”只负责显示道路面轮廓。道路宽度和交通量等属性仍通过点击道路中心线查看。
- 手机端侧栏使用底部把手控制：点击可开关，向上拖动可展开，向下拖动可收起；侧栏展开时仍可移动地图。

## 路线导航

选择起点和终点后，地图可以分别计算驾车与公共交通路线。

> **导航功能仍存在已知问题，结果仅供参考。** 驾车路线尚不能准确判断道路交汇处的转向限制，可能包含跨越实线等游戏中不允许的转向。公共交通路线暂不能区分线路沿道路运行的正向与逆向，可能给出方向不符的乘车或换乘方案。请结合游戏中的道路标线、转向规则和实际线路方向核对结果。

先点击地图中的建筑或设施，在详情中点击“设为起点”；再选另一个位置点击“设为终点”，在“路线规划”查看结果。若没有找到路线，先尝试路网连通、靠近道路或站点的两个位置。

### 驾车

- **最快路线**：综合道路速度、道路 `Volume` 和信号灯节点估算行驶时间。
- **里程最短路线**：优先减少总行驶距离。
- **避开高交通量**：提高高 `Volume` 路段的成本，倾向于绕开拥堵道路。

路线时间为基于游戏快照的估算值，不等同于游戏内部的实时交通模拟结果。

### 公共交通

- **最短时间**：以总耗时为主要目标。
- **少走路**：优先减少步行距离。
- **少换乘**：优先减少换乘次数。

支持公交、有轨电车、地铁、火车、船舶和渡轮。地铁出行会先把起点接入附近可用出入口，再计入固定站内步行时间；终点方向反向处理。到站停靠时间按交通方式计入总时长。

## 从源码编译

### 环境要求

- Windows 10/11 x64
- Node.js 20 或更高版本
- JDK 17 或更高版本
- Android SDK 34
- 可选：Android Studio

### Windows 桌面版

```powershell
cd skylens-desktop-source
npm install
npm test
npm start
```

直接运行时会启动 Electron 开发窗口。

生成免安装 ZIP：

```powershell
npm run dist:zip
```

构建产物位于：

```text
skylens-desktop-source/release/
```

还可以运行：

```powershell
npm run dist
```

生成 Windows 安装程序和便携版 EXE，预期产物为：

```text
release/SKYLENS Desktop-0.1.0-Setup.exe
release/SKYLENS Desktop-0.1.0-Portable.exe
```

安装程序已配置为带向导、允许选择安装目录、默认按当前用户安装。首次构建需要联网获取 npm 依赖、Electron 和 NSIS 工具。详细说明见[安装包制作指南](docs/发布与Windows安装包.md)。构建成功后仍需实际检查安装、运行与卸载流程。

### Android

使用命令行构建：

```powershell
cd skylens-mobile-android-source
.\gradlew.bat :app:assembleDebug
```

APK 位于：

```text
skylens-mobile-android-source/app/build/outputs/apk/debug/app-debug.apk
```

通过 ADB 安装到已连接并开启 USB 调试的手机：

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

也可以使用 Android Studio：

1. 打开 `skylens-mobile-android-source`。
2. 等待 Gradle Sync 完成。
3. 选择设备，点击 Run。
4. 或选择 `Build → Build Bundle(s) / APK(s) → Build APK(s)`。

当前 Android 工程使用调试签名生成可直接测试的 APK。准备正式发行版时，应配置自己的 release keystore。

### 测试

桌面版单元测试：

```powershell
cd skylens-desktop-source
npm test
```

Android 的纯 Java 核心自测需要额外提供 `org.json`。详细命令见 [Android README](skylens-mobile-android-source/README.md)。

## 工作原理

### Windows

Electron 为每个地图窗口启动一个仅监听 `127.0.0.1` 的本地服务器，向内置网页提供 `session.json` 和所选地图快照。

### Android

WebView 加载虚拟地址 `https://appassets.androidplatform.net/`。网页资源来自 APK assets，`session.json` 和快照文件由本地 `MapRouter` 拦截请求后返回；非本地请求会被拒绝。

两个平台都复用与 SKYLENS MAPS 相同的地图前端，并在此基础上加入地图库、离线路由、统计面板和道路/建筑增强功能。

## 数据与隐私

- 地图和快照只保存在本地。
- 应用不上传城市数据，不需要账号，也不依赖在线地图服务。
- Windows 的本地 HTTP 服务只监听 `127.0.0.1`。
- Android 的 WebView 请求全部由本地拦截器处理。
- 删除应用前，请自行备份仍需保留的地图快照。

## 项目结构

```text
.
├─ skylens-desktop-source/         Windows / Electron 源码和地图库逻辑
│  ├─ app/                         内置地图网页
│  ├─ scripts/                     网页构建与地图功能补丁
│  ├─ src/                         Electron 主进程和导入逻辑
│  └─ test/                        Node.js 测试
├─ skylens-mobile-android-source/  Android 源码
│  ├─ app/src/main/assets/web/     内置地图网页
│  ├─ app/src/main/java/           原生 Java 客户端与核心逻辑
│  └─ tools/                       核心自测与 Web 资源补丁
├─ docs/                           截图与使用、发布说明
└─ README.md
```

`maps/`、`build/`、`.gradle/`、`node_modules/`、`release/`、APK、Windows ZIP 以及个人地图快照都属于本地运行或构建数据，不应提交到源码仓库。

## 已知限制

- 城市快照必须来自兼容版本的 SKYLENS MAPS 导出流程。
- 大型城市可能占用较多内存，尤其是同时启用高精度道路或计算用地面积时。
- 高精度道路面只用于显示，不参与点击选择；道路属性通过中心线查看。
- 路线时间是基于道路速度、交通量、信号节点和固定停靠时间计算的估算值。
- **交叉口转向限制识别不完整**：目前不能准确判断道路交汇处是否允许转向，可能规划出跨越实线等不符合游戏道路规则的路线。
- **公共交通行驶方向尚未区分**：目前不能区分线路沿道路运行的正向与逆向，可能影响乘车方向、站点衔接及换乘方案的准确性。
- Android 设备、WebView 版本和可用内存会影响地图加载速度及最大可导入规模。
- 本项目不是官方游戏功能，不保证与未来游戏或模组版本持续兼容。

## 常见问题

### 为什么 Android 无法导入原始 `exported_files`？

Android 版没有内置原始导出目录整理流程。请先用 Windows 版导入，再把整理后的地图快照打包为 ZIP 传到手机。

### 为什么开启高精度道路后等待时间较长？

高精度道路需要读取额外的道路面数据，并占用更多内存。大型城市首次开启时可能需要数秒到数十秒。

### 为什么点击道路面没有属性？

这是当前设计。高精度道路层只负责显示轮廓，请关闭高精度道路或点击道路中心线查看宽度、交通量和道路类别。

### 为什么导航没有找到公交线路？

请先确认地图快照包含公共交通路线和站点数据、步道网络连通，并且已成功生成地铁出入口索引。不同版本快照的字段完整性会影响路线结果。

## 致谢

- 地图网页与原始 SKYLENS MAPS 项目：[ganjanggejang/skylens-maps](https://github.com/ganjanggejang/skylens-maps)
- 地图渲染：[MapLibre GL JS](https://maplibre.org/)
- 游戏及商标归其各自权利人所有

## 许可证

本项目使用 **GPL-3.0-only**。

- [Windows 端许可证](skylens-desktop-source/LICENSE.txt)
- [Android 端许可证](skylens-mobile-android-source/LICENSE.txt)
- [第三方许可说明](skylens-desktop-source/THIRD_PARTY_NOTICES.txt)

如果你分发修改后的版本，请同时遵守 GPL-3.0 的源码开放要求。

---

如果这个项目对你有帮助，欢迎在 GitHub 提交问题、改进建议或 Pull Request。
