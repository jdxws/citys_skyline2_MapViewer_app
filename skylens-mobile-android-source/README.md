# SKYLENS Mobile（安卓版）

在安卓手机上离线查看 SKYLENS MAPS（《城市：天际线 2》模组）导出的城市地图快照。
功能与电脑版 SKYLENS Desktop 相同：导入快照 → 在“我的地图”里管理 → 点“打开”查看。
内置与游戏里相同的地图网页，**完全离线**（代码会拒绝所有非本地请求）。

纯原生 Java + WebView，**没有任何第三方依赖**，只使用 Android 系统自带的 API。

v0.1.2 修复了地图菜单展开后显示在屏幕顶部的问题：恢复加载 `android-mobile.css`，菜单重新锚定屏幕底部。与 v0.1.1 签名一致，可直接覆盖安装。已通过四种手机尺寸的模拟布局检查，尚未进行安卓真机验证。

## 一、构建并安装

### 方式 A：Android Studio（推荐）
1. 安装最新版 [Android Studio](https://developer.android.com/studio)。
2. `File → Open…`，选择本文件夹（含 `settings.gradle` 的那一层）。首次同步会自动下载 Gradle 8.7、
   Android Gradle 插件 8.5.2 和 Android SDK 34（按提示点 Install 即可）。
3. 手机打开“开发者选项 → USB 调试”，用数据线连接电脑，点工具栏的 ▶ Run。
   或者 `Build → Build Bundle(s) / APK(s) → Build APK(s)`，得到 `app/build/outputs/apk/debug/app-debug.apk`。

### 方式 B：命令行
需要 JDK 17+ 和 Android SDK（设置 `ANDROID_HOME`，并安装 platform 34 与 build-tools）。
```
./gradlew assembleDebug        # Windows 用 gradlew.bat
./gradlew assembleExportPreview # 可与旧版并存的“SKYLENS 导出测试版”
```
产物：`app/build/outputs/apk/debug/app-debug.apk`

导出测试版产物在 `app/build/outputs/apk/exportPreview/app-exportPreview.apk`，包名为 `io.github.skylens.mobile.exportpreview`，有独立地图库，需重新导入地图，不会覆盖旧版。版本号为 `0.1.2-export-preview`。

构建时优先使用本地 `.signing/debug.keystore`（不提交到 Git）。请保留此文件，以便以后用同一签名覆盖更新；没有此文件时使用 Android 默认的调试签名配置。签名与已安装旧版不一致时，原包名 APK 不能直接覆盖安装，可先使用并行测试版。

### 把 APK 装到手机
- 数据线 + USB 调试：`adb install -r app/build/outputs/apk/debug/app-debug.apk`
- 或把 APK 传到手机，点开安装（需要允许“安装未知应用”）。
- 用的是调试版，由 Android 自动签名，自己用完全够了。不要用 `assembleRelease`（它是未签名的，装不上）。

## 二、使用

地图页右下角的“导出图片”支持方形地图 PNG 和地铁示意图 PNG/SVG，可选择图层、线路、分辨率并预览。保存使用系统文档选择器，手机建议先使用 1024 或 2048。共享导出代码的维护方法见 [MAP-EXPORT.md](../skylens-desktop-source/docs/MAP-EXPORT.md)。
1. 把快照放到手机上（推荐一个 `.zip`；例如你的 `c4653fee929a085b.zip`）。
2. 打开应用，点“选择 ZIP…”（或“选择文件夹…”），选中快照。
3. 等导入完成（大快照仍可能有数百 MB，保持屏幕常亮），在“我的地图”里点“打开”。会保留高精度道路和用地统计所需的数据；高精度道路文件仅在地图里开启该图层后读取。
4. 返回键回到地图库。地图库里可以重命名、删除；导入的是副本，不会动原文件。

**可导入的内容**（自动识别）：快照 ZIP；快照文件夹（游戏的 `ModsData/CityMap/snapshots/<id>`）；
已构建 `dist` 里的 `data` 文件夹；包含多个快照的文件夹（全部导入）。
快照需要是“已处理好”的：同级有 `GeoJSON/`、`manifest.json`、`water-mask.png`。
**不支持**未处理的原始 `exported_files`（手机版没有整理功能）：请先用电脑版导入，再把电脑版地图库里的
快照文件夹打成 ZIP 传到手机。

## 三、已知限制（请先看这一节）
- **内存**：`Zoning_Boundary.json` 与 `Network_Boundary.json` 都按需读取；高精度道路文件约 56 MB（压缩包示例中的解压大小），开启时会占用更多内存与加载时间。
- **存储**：为支持高精度道路图层，快照会保留 `Network_Boundary.json`；应用地图库占用会比只导入中心线地图更大。
- **文件夹导入**：Android 11+ 不允许选择“下载”等根目录和 `Android/data`，请选其中的子文件夹，或改用 ZIP。
  文件夹导入走系统文件框架，文件很多时比 ZIP 慢。
- **设备验证**：APK 可以通过 Gradle Debug 构建；仍需在真实手机/WebView 上检查地图显示、触控和大型快照导入表现。

## 四、排错
- 打开地图是空白页：先用调试版运行，在电脑 Chrome 打开 `chrome://inspect` 查看 WebView 的控制台
  （调试版自动开启远程调试）；同时看 `adb logcat -s SkylensMap`。
- Gradle 同步失败：确认 Android Studio 用的是 JDK 17+（`Settings → Build Tools → Gradle → Gradle JDK`）。
  如果 Android Studio 提示升级 AGP/Gradle，可以直接同意。
- 提示“压缩包里的文件名编码无法识别”：用 UTF-8 重新打包（7-Zip 默认即可，部分旧的中文 Windows 压缩工具会用 GBK）。

## 五、目录结构
```
app/src/main/java/io/github/skylens/mobile/
  core/            纯 Java 核心逻辑（不依赖 Android，可在电脑上测试）
    Importer         导入 ZIP / 文件夹，自动识别并校验快照
    Library          地图库（maps/<id>/ + meta/<id>.properties）
    MapRouter        扮演“游戏会话”：/session.json、/snapshots/<id>/…、内置网页
  MainActivity     地图库界面（原生控件，代码里直接搭建，没有 XML 布局）
  MapActivity      WebView 地图页（shouldInterceptRequest 交给 MapRouter）
  DocumentNode     通过存储访问框架读取用户选中的文件夹
app/src/main/assets/web/   内置的地图网页（上游 SKYLENS MAPS 的 `npm run build:app` 产物）
tools/CoreSelfTest.java    核心逻辑自测
```

### 运行核心自测（电脑上，需要 JDK 17+）
```
javac -cp <org.json> -d out app/src/main/java/io/github/skylens/mobile/core/*.java tools/CoreSelfTest.java
java -cp out:<org.json> CoreSelfTest <快照.zip> app/src/main/assets/web
```

> 出入口表生成（`SubwayEntranceBuilder`）用到 `org.json`。它是 Android 自带的，电脑上跑自测需要自己提供一个
> （例如 Maven 的 `org.json:json`，或 https://github.com/stleary/JSON-java 的源码编译）。

### 更新内置网页
在上游 skylens-maps 源码目录执行 `npm ci && npm run build:app`，用生成的 `dist/` 内容替换 `app/src/main/assets/web/`。

## 六、工作原理
WebView 加载 `https://appassets.androidplatform.net/`（一个虚拟域名）。所有请求都在 `shouldInterceptRequest`
里由 `MapRouter` 直接从本地读取并返回：网页文件来自 APK 的 assets，`/session.json` 由应用生成，
`/snapshots/<id>/…` 对应地图库里的快照文件。网页因此以为自己连着游戏里的模组。

## 道路样式与水体平滑补丁

地图网页（打包后的 `index-*.js`）上的四级道路、立交高程分层、近景线宽和水体平滑由可重复运行的脚本生成：

```text
node tools/patch-road-style.mjs app/src/main/assets/web
```

配色、线宽和层数在 `tools/patch-road-style.mjs` 顶部的 `STYLE` 中调整。高架与隧道中心线可以悬停和点选，高精度道路模式会隐藏重复的中心线；方向箭头也按层级分层绘制（高架会盖住下层道路的箭头）；水体处理失败时自动回退原图。补丁完成后需要重新构建 APK。

## 许可
GPL-3.0-only。内置网页来自 https://github.com/ganjanggejang/skylens-maps （GPL-3.0-only），
第三方组件许可见 `THIRD_PARTY_NOTICES.txt`。
