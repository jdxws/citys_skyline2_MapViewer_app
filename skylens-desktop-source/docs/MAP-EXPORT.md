# 地图图片与地铁线路导出

Windows 和 Android 的地图页右下角都有“导出图片”按钮。

1. 选择“城市地图”或“地铁线路示意图”。
2. 选择 1024、2048、4096、8192 的方形分辨率，或输入 256–8192 的自定义整数边长。实际可用尺寸受设备 GPU 和内存限制，手机建议从 1024 或 2048 开始。
3. 城市地图可以选择当前视野（完整包含原视野并适配方形）或全城道路范围，勾选水体、建筑、道路、铁路、步道、绿地、行政区、设施图标、站点和文字，以及具体交通线路。线路图例可单独关闭。全城范围按道路中心线边界确定。
4. 地铁示意图可以选择具体地铁线路、站名和图例开关、标准/精细质量、布局种子，输出 PNG 或 SVG。地铁示意图复用 `generate-metro-map.mjs` 的线路识别、环线合并、站点布局和 SVG 绘制算法；网页模式只绘制线路及站点，不加载 CLI 的山体与河流背景。站名相同会被视作同一站，站间距离不按真实比例。
5. 点击“生成预览”，确认后点击“保存图片…”。更改选项会使旧预览失效；生成期间可取消。Windows 打开“另存为”窗口，Android 打开系统文档保存窗口，不需要额外的存储权限。

## 构建与维护

共享代码在 `web-export/`。运行 `npm run build:export` 会更新桌面网页和 Android 内置网页，并从现有 CLI 生成无 Node 依赖的 `export/metro-core.mjs`。请修改原始 CLI，勿直接编辑生成的内核。

脚本会在现有地图包初始化处接入 `window.skylensMap`。重复运行不会重复注入；如果网页包升级导致接入位置改变，会给出错误，需要更新接入点。`build:web` 已接入桌面导出资源安装；替换 Android 网页资源后也需要重新运行 `build:export`。

生成较慢的地铁布局运行在独立 Web Worker 内，取消时终止线程。普通地图使用独立的 MapLibre 画布，保留浏览窗口的状态，按最终分辨率重新渲染。

## 浏览器调用接口

地图就绪后可使用 `window.skylensExport`；渲染返回 Blob，不触发文件保存。

```js
const image = await window.skylensExport.renderMap({
  size: 2048,
  extent: 'city', // 'view' 使用当前视野
  groups: ['water', 'parks', 'buildings', 'roads', 'tracks', 'labels'],
  routeKeys: [],
  legend: true,
}, { signal: abortController.signal, progress: console.log })

await window.skylensExport.save(image, 'city.png')
```

`groups` 可用值：`water`, `parks`, `buildings`, `roads`, `tracks`, `paths`, `waterways`, `districts`, `pois`, `stops`, `labels`。线路键由快照中每条线路的 `Transport + '|' + Route + '|' + Name` 组成；三部分未定义时使用空字符串。

```js
const image = await window.skylensExport.renderMetro({
  size: 2048,
  routeKeys: ['Subway|1|地铁一号线'], // 必须与当前快照匹配
  format: 'svg', // 或 'png'
  labels: true,
  legend: true,
  quality: 'standard', // 或 'detailed'
  seed: 1,
}, { signal: abortController.signal, progress: console.log })
```

两个渲染接口均返回 `{blob, mime, extension, width, height, warnings}`。`open()` 打开交互面板；`save(result, filename)` 在两个原生客户端调用系统保存窗口，在普通浏览器中使用下载。

## 验证

`node --test test/map-export.test.mjs` 检查选层、线路筛选、图标与文字独立控制、尺寸边界和浏览器内核文件系统隔离。原有 `test/metro-map.test.js` 继续验证地铁算法。真实高楼村快照用于 Electron 图片生成及预览状态集成检查；Android Java 源码使用官方 Android 34 平台编译验证。Android 实机上的系统保存窗口、WebView 内存上限和 GPU 分辨率仍需设备验证。
