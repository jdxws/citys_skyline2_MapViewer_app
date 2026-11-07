import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const zh = {
  language: '语言', menu: '地图菜单', intro: '浏览城市道路与建筑。', directions: '路线规划',
  expandSidebar: '展开侧栏', collapseSidebar: '收起侧栏', mapLoading: '正在加载地图数据…',
  mapFailed: '地图加载失败', retry: '重试', snapshot: '快照', snapshotLoading: '正在准备地图',
  snapshotReady: '地图已就绪', snapshotPartial: '部分数据不可用', snapshotError: '地图错误',
  routeDataLoading: '正在准备道路路径数据…', map: '城市地图', building: '建筑', road: '道路',
  poi: '设施 · 站点', route: '线路', transit: '公共交通', unnamed: '未命名{kind}',
  detail: '所选对象详情', closeDetail: '关闭详情', setOrigin: '设为起点', setDestination: '设为终点',
  brand: '商家', asset: '资产', category: '类别', zoning: '分区类型', resident: '居民', employee: '员工',
  lane: '车道数', limit: '限速', direction: '方向', form: '道路形式', transport: '交通方式',
  color: '颜色', length: '长度', passenger: '乘客数', stop: '站点数', usage: '使用量', vehicle: '车辆',
  object: '类型', nearbyRoutes: '附近公交线路', transportLoading: '正在加载交通数据…',
  transportFailed: '无法加载交通数据。', noLinkedRoutes: '未找到关联线路。',
  nearbyRoutesNote: '线路根据设施和站点位置估算；导出数据不含建筑与线路的关联 ID。',
  nearbyStops: '附近站点', unnamedStop: '未命名站点 #{number}', stopsLoading: '正在加载站点数据…',
  stopsFailed: '无法加载站点数据。', noStops: '线路附近没有站点。',
  nearbyStopsNote: '此估算列表按线路几何的起点方向排列；导出数据不含站点顺序或连接 ID，可能与游戏中的顺序不同。',
  extraInfoRegion: '附加信息区域', extraInfo: '附加信息', noExtraInfo: '没有可显示的附加信息。',
  internalId: '地图内部 ID：{id}', searchRegion: '地图搜索', search: '搜索', searchPlaceholder: '搜索名称或地址',
  searchResults: '{count} 个结果', firstHundred: '显示前 100 个', noResults: '没有搜索结果。',
  searchResultsAria: '{label}搜索结果', searchLoading: '正在加载设施和线路搜索数据…',
  searchFailed: '无法加载{sources}的搜索数据，结果可能不完整。', back: '← 返回', origin: '起点',
  destination: '终点', swapAria: '交换起点和终点', swap: '交换起点和终点 ↕',
  samePlace: '起点和终点相同。', calculating: '正在计算路线…', findRoute: '查找路线',
  showVehicle: '在地图上显示驾车路线', showTransit: '在地图上显示公交路线', minutes: '{count} 分钟',
  routeSummary: '{count} 段道路 · 接驳步行 {distance} 米',
  vehicleAccessFailed: '起点或终点 250 米内没有道路。',
  vehicleDisconnected: '按允许的行驶方向找不到连通路线。',
  vehicleNote: '预计时间 · 未计入交通状况 · 按道路限速的 80% 估算', transfers: '换乘 {count} 次',
  walk: '步行 {distance} 米', wait: '等待 {minutes} 分钟',
  transitNoService: '没有找到可用的客运线路和站点。',
  transitAccessFailed: '起点或终点 1 公里步行范围内没有站点。',
  transitDisconnected: '找不到包含步行接驳且最多换乘两次的路线。',
  transitCalculating: '正在计算公交路线…', transitDataLoading: '正在准备站点和线路数据…',
  selectPlaces: '选择起点和终点以查找路线。', assumptionStops: '根据线路几何估算站点位置和顺序',
  assumptionBidirectional: '假设线路双向运行', assumptionWait: '每次上车按平均等待 5 分钟估算，不使用时刻表',
  layers: '图层', mapLayers: '地图图层', transitLayers: '交通图层',
  transportNote: '公交、火车、有轨电车、地铁、船舶和渡轮显示线路、站点与设施；航空仅显示站点和设施。',
  loading: '加载中', noData: '无数据', count: '{count} 个要素', loadError: '加载错误',
  retryLayer: '错误 · 切换图层以重试', loadOnEnable: '{count} 个要素 · 开启后加载',
  waterData: '水体数据：', districtData: '区划数据：', poiData: '交通设施和站点数据：', routeData: '线路数据：',
  water: '水体', buildings: '建筑', roads: '道路', tracks: '铁路', pathways: '路径', waterways: '水路',
  districts: '行政区', bus: '公交', train: '火车', tram: '有轨电车', subway: '地铁', ship: '船舶', ferry: '渡轮', air: '航空',
  roadNotReady: '道路数据尚未准备就绪。', waterMissing: '没有可用的水深数据',
  mapRenderError: '地图渲染错误：{detail}', unknownError: '未知错误',
  workerTransitNotReady: '公交线路数据尚未就绪。', workerRoadNotReady: '道路数据尚未就绪。',
  requestFailed: '{file} 请求失败（HTTP {status}）', invalidJson: '无法读取 {file} 中的 JSON',
  invalidGeojson: '{file} 中的 GeoJSON 结构无效', missingDataset: '缺少数据集 ID，请重新运行 npm run prepare:data。',
  areaMetadataMissing: '缺少区域元数据', areaMetadataInvalid: '区域元数据无效',
  waterMetadataMissing: '缺少水深元数据', waterMetadataInvalid: '水深元数据无效',
  waterImageFailed: '无法加载 water-mask.png', emptyCoordinates: '坐标数组为空', invalidCoordinates: '坐标无效',
  transitSourceFailed: '无法加载 {source} 数据。', networkRoadMissing: 'Network_Centerline.json 中没有道路',
  transitPrepareFailed: '无法准备公交数据。', routingFailed: '路线计算错误',
  routingWorkerFailed: '无法启动路线计算 Worker。', transitWorkerFailed: '无法启动公交路线 Worker。',
  stopName: '站点 #{number}', routeName: '线路 #{number}',
}

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one ${label} patch point in the built map bundle`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

export async function patchChineseLocale(appRoot) {
  const assets = path.join(appRoot, 'assets')
  const bundles = (await readdir(assets)).filter(name => /^index-.*\.js$/.test(name))
  if (bundles.length !== 1) throw new Error(`Expected one map bundle in ${assets}`)
  const file = path.join(assets, bundles[0])
  let source = await readFile(file, 'utf8')
  if (source.includes('children:"简体中文"')) return
  source = replaceExactly(
    source,
    '},HR={ko:qR,en:ZR},iA="cities-maps-language"',
    `},ZH=${JSON.stringify(zh)},HR={ko:qR,en:ZR,zh:new Proxy(ZR,{get:(target,key)=>Object.hasOwn(ZH,key)?ZH[key]:target[key]})},iA="cities-maps-language"`,
    'locale dictionary',
  )
  source = replaceExactly(
    source,
    'window.localStorage.getItem(iA)==="ko"?"ko":"en"',
    'window.localStorage.getItem(iA)==="ko"?"ko":window.localStorage.getItem(iA)==="zh"?"zh":"en"',
    'locale persistence',
  )
  source = replaceExactly(source, 'document.documentElement.lang=t;', 'document.documentElement.lang=t==="zh"?"zh-CN":t;', 'document language')
  source = replaceExactly(source, 'new Intl.NumberFormat(t==="ko"?"ko-KR":"en-US")', 'new Intl.NumberFormat(t==="ko"?"ko-KR":t==="zh"?"zh-CN":"en-US")', 'number formatting')
  source = replaceExactly(
    source,
    'J.jsx("button",{type:"button",lang:"en","aria-pressed":W==="en",onClick:()=>te("en"),children:"English"})]})]}),e==="ready"',
    'J.jsx("button",{type:"button",lang:"en","aria-pressed":W==="en",onClick:()=>te("en"),children:"English"}),J.jsx("button",{type:"button",lang:"zh-CN","aria-pressed":W==="zh",onClick:()=>te("zh"),children:"简体中文"})]})]}),e==="ready"',
    'Chinese language switch',
  )
  await writeFile(file, source)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const appRoot = path.resolve(process.argv[2] ?? '')
  if (!process.argv[2]) throw new Error('Usage: node scripts/patch-chinese-locale.mjs <built-app-directory>')
  await patchChineseLocale(appRoot)
}
