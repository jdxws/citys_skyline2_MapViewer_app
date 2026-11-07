# SKYLENS Desktop

离线桌面查看器：导入 SKYLENS MAPS（《城市：天际线 2》模组）导出的城市快照，在游戏之外查看地图。
应用内置与游戏里相同的地图网页，不需要开游戏、不需要命令行。

## 使用
1. 解压 `SKYLENS Desktop-*-win-x64.zip`，双击 `SKYLENS Desktop.exe`。
2. 把以下任意一种拖进窗口（或点“选择文件夹… / 选择 ZIP…”）：
   - 快照 `.zip` 压缩包
   - `exported_files` 文件夹（原始导出，应用会自动整理）
   - 已构建的 `dist` 文件夹
   - 游戏 `ModsData/CityMap/snapshots/<id>` 文件夹
3. 在“我的地图”里点“打开”。可重命名、删除；导入的是副本，不会改动原文件。

地图库位置：`%APPDATA%\skylens-desktop\library`（窗口底部也会显示）。

导入会保留 `Network_Boundary.json`，供按需开启的高精度道路图层使用；`Zoning_Boundary.json` 供统计面板按需计算用地面积。

## 从源码运行 / 打包（需要 Node.js 20+）
```
npm install
npm start            # 直接运行
npm test             # 单元测试
npm run dist:zip     # 免安装 zip（release/）
npm run dist         # 安装程序 + 便携版 exe（建议在 Windows 上执行）
```
更新内置网页：`node scripts/build-web.mjs <skylens-maps 源码目录>`（执行其 `npm run build:app` 并复制到 `app/`）。

## 自定义地图信息补丁

当前内置网页来自压缩后的前端构建产物。道路交通量、单行方向箭头、建筑扩展属性及高精度道路详情由以下补丁脚本加入：

```
node scripts/patch-road-building-details.mjs
```

脚本会同步更新桌面源码、已解压的桌面程序和 Android Web 资源；重复执行不会重复插入。

高精度道路面会先在工作线程中按约 1.5 米误差简化，再交给 MapLibre 渲染。该图层仅用于显示，不参与地图点击或详情选择；地面、高架和隧道道路中心线均可点击查看 `Volume`、`Width` 等详情。

公共设施建筑会显示停车、学校、警局、消防、医院、行政、公园和公用设施图标；商业、办公、工业和住商混合使用基础颜色区分。建筑和道路详情按类别分组，方向箭头从缩放级别 14 开始显示。高精度道路开关已并入地图图层面板。

城市统计增加区级年龄和性别比，并可按居民数计算全市平均年龄及男女人口比例。

手机端侧栏使用固定在底部的单一把手控制：收起时显示“菜单”标签，展开后成为面板顶部拖动条。点击把手可开关侧栏，向上拖至全展开，向下拖至半展开或收起。面板外没有遮罩，地图始终可以平移、缩放和选择对象。

图层、公共交通和城市统计统一放在主侧栏顶部。图层与交通菜单在当前侧栏内展开；移动端打开城市统计时会先收起主侧栏，避免两个面板互相遮挡。

导航可同时比较车辆与公共交通策略，并在卡片中切换地图上实际显示的路线。车辆提供最快、里程最短和避开高交通量三种路线，并根据信号灯 POI 与道路 `Volume` 将信号等待和静态交通量延误计入预计时间。公共交通提供少走路、少换乘和最短时间三种路线，默认显示并选中最短时间，支持公交、火车、有轨电车、地铁、船舶和渡轮。地铁乘客先从起点步行到某个可用出入口，再按固定 3 分钟站内步行进入站台；终点反向处理。所有入口会共同参与总时间比较，因此相近入口会按最终线路和总耗时选择。同一车站的多个站台会通过出入口表中的车站分组显式连通，避免某个站台没有吸附到地面步道时导致同站不同线路无法换乘。到站停靠时间分别为：公交 25 秒、有轨电车 30 秒、地铁 1 分钟、火车 2 分钟、船舶和渡轮 2 分钟。不使用固定发车等待或换乘惩罚，换乘步行不设最大距离限制，仅要求步行路网或同站平台分组连通；换乘次数也不设固定两次上限。

快照准备阶段会生成 `GeoJSON/Subway_Station_Entrances.json`。它把同名的 `StopSubway` 站台按 120 米距离合并成车站，将 `SubwayStationEntrance` 建筑归入最近站台所属车站，并保存出入口点数、坐标、轮廓、来源要素和到站台距离。已有快照可运行：

```text
node scripts/generate-subway-entrances.mjs
```

```text
node scripts/patch-navigation-alternatives.mjs
```

## 道路样式与水体平滑补丁

地图网页（打包后的 `index-*.js`）上的四级道路、立交高程分层、近景线宽和水体平滑由独立脚本生成：

```text
node scripts/patch-road-style.mjs app
```

脚本可重复运行，配色、线宽和层数在脚本顶部的 `STYLE` 中调整。道路会根据 `Category` 和坐标高程分成快速路、主干道、次干道、支路，以及隧道、地面和高架 1–3 层；高架与隧道中心线可以悬停和点选，高精度道路模式会隐藏重复的中心线；方向箭头也按层级分层绘制（高架会盖住下层道路的箭头，隧道里的箭头会被地面盖住）。水体岸线使用浏览器画布模糊和等值线处理，失败时自动回退原图。

对应算法和补丁脚本的自动测试位于 `test/road-style.test.js`。

## 说明
- 工作原理：每个地图窗口启动一个仅监听 127.0.0.1 的本地服务器，提供网页并模拟游戏会话（`session.json`）。
- 打包时关闭了 exe 资源编辑（`signAndEditExecutable: false`），所以 exe 使用默认 Electron 图标；窗口图标正常。
- 许可：GPL-3.0-only。内置网页来自 https://github.com/ganjanggejang/skylens-maps ，第三方许可见 THIRD_PARTY_NOTICES.txt。

## 地铁出入口表
游戏导出的“已处理好的快照”本身不带 `GeoJSON/Subway_Station_Entrances.json`（地铁路由用它来选最近的出入口）。
导入时会自动补生成；之前导入的地图在**首次打开时**补生成。生成失败只记日志，不影响地图使用。
原始 `exported_files` 的整理流程（`prepare.js`）本来就会生成；也可以手动运行
`node scripts/generate-subway-entrances.mjs <快照目录>`。

## 测试
`npm test` 运行 `test/` 下所有 `*.test.js` 和 `*.test.mjs`。`transit-entry-access.test.mjs` 里“真实城市”那部分需要
你自己的快照数据：用环境变量 `SKYLENS_CITY_GEOJSON` 指向快照的 `GeoJSON` 目录（需要已有 `Subway_Station_Entrances.json`），
找不到数据时只会提示跳过，其余测试照常运行。
