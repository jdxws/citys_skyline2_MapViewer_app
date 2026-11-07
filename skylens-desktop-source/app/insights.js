(() => {
  'use strict'

  let cachedSummary = null
  let cachedZoningSummary = null
  let highDetailButton = null
  let highDetailEnabled = false
  let highDetailLoading = false
  let layerMenuObserver = null
  let sidebarSheetHandle = null
  let sidebarPanelObserver = null
  let sidebarResizeObserver = null
  let sidebarSnap = 'half'
  let sideToolsObserver = null
  const currentLanguage = () => {
    const language = String(document.documentElement.lang || '').toLowerCase()
    if (language.startsWith('zh')) return 'zh'
    if (language.startsWith('ko')) return 'ko'
    return 'en'
  }
  const locale = () => currentLanguage() === 'zh' ? 'zh-CN' : currentLanguage() === 'ko' ? 'ko-KR' : 'en-US'
  const translations = {
    zh: {
      'City data': '城市统计', 'City overview': '全市概览',
      'district records · values from the snapshot': '个区 · 数据来自当前快照', Close: '关闭', 'Close city overview': '关闭城市概览',
      Residents: '居民', Employees: '员工', Households: '住户', Companies: '公司',
      'Average age': '平均年龄', 'Sex ratio (M/F)': '性别比（男/女）', Age: '年龄', 'Sex ratio': '性别比',
      'GDP / personal income': 'GDP / 居民收入', 'Not provided': '快照未提供',
      'Profit · exported field': '利润 · 导出字段', 'Wage · labor-weighted field': '工资 · 按劳动人口加权',
      'Area · km²': '面积 · 平方公里', 'Profit per resident · derived': '人均利润 · 派生值',
      'Residents / km² · derived': '人口密度 · 人/平方公里', 'Residents per household · derived': '平均家庭人数 · 派生值',
      'Employees / residents · derived': '员工/居民比 · 派生值', 'Companies / 1,000 residents · derived': '每千名居民对应公司数 · 派生值',
      'Area share': '面积占比', 'Employment ratio': '员工/居民比', 'Residents / km²': '人口密度', 'Residents / household': '平均家庭人数',
      'Color legend': '地图配色说明', Residential: '住宅', Commercial: '商业', 'Residential + commercial': '商住混合', Office: '办公', Industrial: '工业', Park: '公园', Healthcare: '医疗', Education: '教育', Safety: '公共安全',
      Expressway: '快速路', 'Arterial road': '主干道', 'Collector road': '次干道', 'Local street': '支路',
      'High-detail roads': '高精度道路', 'High-detail roads: on': '高精度道路：已开启',
      'Loading road surfaces…': '正在加载道路面…', 'High-detail roads failed': '高精度道路加载失败',
      'District comparison': '各区对比', District: '区名', 'Unnamed district': '未命名分区', Profit: '利润', 'Profit / resident': '人均利润', Wage: '工资',
      'GDP and personal income are not exported as named measures. Profit is the source Profit field; profit per resident is only a derived comparison, not GDP per capita. Wage is the source Wage field (unit not specified), weighted by Labor for the city figure.':
        '导出数据没有 GDP 或居民个人收入字段。利润使用源字段 Profit；人均利润仅供比较，不代表人均 GDP。工资使用源字段 Wage（未提供单位）；全市值按 Labor 加权。',
      'Land use by zoning': '土地利用分区统计', 'Calculate zoning areas': '计算各类用地面积',
      'Reads the large zoning file only when requested; area is estimated from polygon geometry.': '仅在点击后读取大型分区文件；面积根据多边形几何估算。',
      'Starting zoning analysis…': '正在启动分区分析…', 'Loading district statistics…': '正在加载区级统计…',
      'Zoning / density': '用地类型 / 密度', Features: '要素数', 'approximate polygon area': '多边形估算面积', Reading: '已读取',
      'Zoning analysis failed': '分区分析失败',
      'Zoning analysis failed. The device may not have enough memory for this snapshot.': '分区分析失败，设备可能没有足够内存处理此快照。',
      'District statistics load when opened.': '打开面板后加载区级统计。', 'City and district statistics': '全市与各区统计',
      'No district records in this snapshot.': '此快照中没有区级记录。', 'Could not load district statistics': '无法加载区级统计',
      'Map tools': '地图工具', Menu: '菜单', 'Drag · click to close': '拖动 · 点击收起',
    },
    ko: {
      'City data': '도시 통계', 'City overview': '도시 개요',
      'district records · values from the snapshot': '개 행정구역 · 현재 스냅샷 기준', Close: '닫기', 'Close city overview': '도시 개요 닫기',
      Residents: '거주자', Employees: '근로자', Households: '가구', Companies: '기업',
      'Average age': '평균 연령', 'Sex ratio (M/F)': '성비(남/여)', Age: '연령', 'Sex ratio': '성비',
      'GDP / personal income': 'GDP / 개인 소득', 'Not provided': '제공되지 않음',
      'Profit · exported field': '이익 · 내보낸 필드', 'Wage · labor-weighted field': '임금 · 노동 인구 가중',
      'Area · km²': '면적 · km²', 'Profit per resident · derived': '1인당 이익 · 계산값',
      'Residents / km² · derived': '인구 밀도 · 명/km²', 'Residents per household · derived': '가구당 평균 인원 · 계산값',
      'Employees / residents · derived': '근로자/거주자 비율 · 계산값', 'Companies / 1,000 residents · derived': '거주자 1,000명당 기업 수 · 계산값',
      'Area share': '면적 비율', 'Employment ratio': '고용 비율', 'Residents / km²': '인구 밀도', 'Residents / household': '가구당 인원',
      'Color legend': '지도 색상 범례', Residential: '주거', Commercial: '상업', 'Residential + commercial': '주상 복합', Office: '사무', Industrial: '산업', Park: '공원', Healthcare: '의료', Education: '교육', Safety: '공공 안전',
      Expressway: '고속도로', 'Arterial road': '간선도로', 'Collector road': '집산도로', 'Local street': '국지도로',
      'High-detail roads': '고정밀 도로', 'High-detail roads: on': '고정밀 도로: 켜짐',
      'Loading road surfaces…': '도로 면을 불러오는 중…', 'High-detail roads failed': '고정밀 도로 불러오기 실패',
      'District comparison': '행정구역 비교', District: '행정구역', 'Unnamed district': '이름 없는 행정구역', Profit: '이익', 'Profit / resident': '1인당 이익', Wage: '임금',
      'GDP and personal income are not exported as named measures. Profit is the source Profit field; profit per resident is only a derived comparison, not GDP per capita. Wage is the source Wage field (unit not specified), weighted by Labor for the city figure.':
        '내보낸 데이터에는 GDP 또는 개인 소득 필드가 없습니다. 이익은 원본 Profit 필드이며, 1인당 이익은 비교용 계산값으로 1인당 GDP가 아닙니다. 임금은 원본 Wage 필드이며 단위는 제공되지 않고, 도시 전체 값은 Labor로 가중됩니다.',
      'Land use by zoning': '용도지역별 토지 이용', 'Calculate zoning areas': '용도지역 면적 계산',
      'Reads the large zoning file only when requested; area is estimated from polygon geometry.': '클릭할 때만 대용량 용도지역 파일을 읽으며, 면적은 폴리곤 형상에서 추정합니다.',
      'Starting zoning analysis…': '용도지역 분석을 시작하는 중…', 'Loading district statistics…': '행정구역 통계를 불러오는 중…',
      'Zoning / density': '용도 / 밀도', Features: '피처 수', 'approximate polygon area': '폴리곤 기반 추정 면적', Reading: '읽은 피처',
      'Zoning analysis failed': '용도지역 분석 실패',
      'Zoning analysis failed. The device may not have enough memory for this snapshot.': '용도지역 분석에 실패했습니다. 이 스냅샷을 처리하기에 기기 메모리가 부족할 수 있습니다.',
      'District statistics load when opened.': '패널을 열면 행정구역 통계를 불러옵니다.', 'City and district statistics': '도시 및 행정구역 통계',
      'No district records in this snapshot.': '이 스냅샷에는 행정구역 데이터가 없습니다.', 'Could not load district statistics': '행정구역 통계를 불러올 수 없습니다',
      'Map tools': '지도 도구', Menu: '메뉴', 'Drag · click to close': '드래그 · 클릭하여 닫기',
    },
  }
  const zoningLabels = {
    zh: {
      Unspecified: '未指定', None: '未指定', Generic: '通用', Residential: '住宅', Commercial: '商业',
      Industrial: '工业', Office: '办公', Low: '低密度', Medium: '中密度', High: '高密度',
    },
    ko: {
      Unspecified: '지정 없음', None: '지정 없음', Generic: '일반', Residential: '주거', Commercial: '상업',
      Industrial: '산업', Office: '사무', Low: '저밀도', Medium: '중밀도', High: '고밀도',
    },
  }
  const t = value => translations[currentLanguage()]?.[value] ?? value
  const translateZoning = label => {
    const language = currentLanguage()
    if (language === 'en') return label
    const [uses, density] = label.split(' · ')
    const labels = zoningLabels[language]
    const translatedUses = uses.split(',').map(value => labels[value.trim()] ?? value.trim()).join(language === 'zh' ? '、' : ', ')
    return density ? `${translatedUses} · ${labels[density] ?? density}` : translatedUses
  }
  const number = value => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value)
  const precise = value => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value)
  const numeric = (properties, key) => {
    const value = Number(properties?.[key])
    return Number.isFinite(value) ? value : 0
  }
  const sum = (rows, key) => rows.reduce((total, row) => total + numeric(row, key), 0)
  const display = value => number(value)
  const metric = (label, value) => {
    const card = document.createElement('div')
    card.className = 'skylens-insights-metric'
    const name = document.createElement('div')
    name.className = 'skylens-insights-label'
    name.textContent = label
    const content = document.createElement('div')
    content.className = 'skylens-insights-value'
    content.textContent = value
    card.append(name, content)
    return card
  }

  function table(districts) {
    const wrapper = document.createElement('div')
    wrapper.className = 'skylens-insights-table-wrap'
    const tableEl = document.createElement('table')
    tableEl.className = 'skylens-insights-table'
    const headers = ['District', 'Residents', 'Age', 'Sex ratio (M/F)', 'Residents / km²', 'Residents / household', 'Employment ratio', 'Profit', 'Profit / resident', 'Wage']
    const head = document.createElement('thead')
    const headRow = document.createElement('tr')
    for (const label of headers) {
      const cell = document.createElement('th')
      cell.scope = 'col'
      cell.textContent = t(label)
      headRow.append(cell)
    }
    head.append(headRow)
    const body = document.createElement('tbody')
    for (const district of districts) {
      const row = document.createElement('tr')
      const population = numeric(district, 'Resident_Male') + numeric(district, 'Resident_Female')
      const areaKm2 = numeric(district, 'Area') / 1_000_000
      const households = numeric(district, 'Household')
      const profit = numeric(district, 'Profit')
      const values = [
        district.Name || t('Unnamed district'),
        display(population),
        population > 0 ? precise(numeric(district, 'Age')) : '—',
        numeric(district, 'SexRatio') > 0 ? precise(numeric(district, 'SexRatio')) : '—',
        areaKm2 > 0 ? precise(population / areaKm2) : '—',
        households > 0 ? precise(population / households) : '—',
        population > 0 ? `${precise(numeric(district, 'Employee') / population * 100)}%` : '—',
        precise(profit),
        population > 0 ? precise(profit / population) : '—',
        precise(numeric(district, 'Wage')),
      ]
      values.forEach((value, index) => {
        const cell = document.createElement('td')
        cell.textContent = value
        if (index === 0) cell.title = value
        row.append(cell)
      })
      body.append(row)
    }
    tableEl.append(head, body)
    wrapper.append(tableEl)
    return wrapper
  }

  async function loadSummary() {
    const sessionResponse = await fetch('/session.json', { cache: 'no-store' })
    if (!sessionResponse.ok) throw new Error(`Session unavailable (${sessionResponse.status})`)
    const session = await sessionResponse.json()
    const root = `/${String(session.dataRoot).replace(/^\/+/, '')}`
    const areaResponse = await fetch(`${root}GeoJSON/Area_Boundary.json`)
    if (!areaResponse.ok) throw new Error(`District data unavailable (${areaResponse.status})`)
    const data = await areaResponse.json()
    return {
      zoningUrl: `${root}GeoJSON/Zoning_Boundary.json`,
      districts: data.features
        .map(feature => feature?.properties)
        .filter(properties => properties && properties.Object === 'District')
        .sort((left, right) => String(left.Name ?? '').localeCompare(String(right.Name ?? ''))),
    }
  }

  function render(panel, districts, zoningUrl, zoningSummary = cachedZoningSummary) {
    const residents = districts.map(district => numeric(district, 'Resident_Male') + numeric(district, 'Resident_Female'))
    const totalResidents = residents.reduce((total, value) => total + value, 0)
    const totalMale = sum(districts, 'Resident_Male')
    const totalFemale = sum(districts, 'Resident_Female')
    const totalAreaKm2 = sum(districts, 'Area') / 1_000_000
    const totalEmployees = sum(districts, 'Employee')
    const totalHouseholds = sum(districts, 'Household')
    const totalCompanies = sum(districts, 'Company')
    const totalProfit = sum(districts, 'Profit')
    const totalLabor = sum(districts, 'Labor')
    const weightedWage = totalLabor > 0
      ? districts.reduce((total, district) => total + numeric(district, 'Wage') * numeric(district, 'Labor'), 0) / totalLabor
      : null
    const weightedAge = totalResidents > 0
      ? districts.reduce((total, district) => total + numeric(district, 'Age') * (numeric(district, 'Resident_Male') + numeric(district, 'Resident_Female')), 0) / totalResidents
      : null
    const citySexRatio = totalFemale > 0 ? totalMale / totalFemale * 100 : null

    const fragment = document.createDocumentFragment()
    const heading = document.createElement('div')
    heading.className = 'skylens-insights-head'
    const titleGroup = document.createElement('div')
    const title = document.createElement('h2')
    title.className = 'skylens-insights-title'
    title.textContent = t('City overview')
    const subtitle = document.createElement('div')
    subtitle.className = 'skylens-insights-subtitle'
    subtitle.textContent = `${number(districts.length)} ${t('district records · values from the snapshot')}`
    titleGroup.append(title, subtitle)
    const close = document.createElement('button')
    close.className = 'skylens-insights-close'
    close.type = 'button'
    close.setAttribute('aria-label', t('Close city overview'))
    close.textContent = t('Close')
    close.addEventListener('click', () => { panel.hidden = true })
    heading.append(titleGroup, close)
    fragment.append(heading)

    const grid = document.createElement('div')
    grid.className = 'skylens-insights-grid'
    grid.append(
      metric(t('Residents'), display(totalResidents)),
      metric(t('Average age'), weightedAge === null ? '—' : precise(weightedAge)),
      metric(t('Sex ratio (M/F)'), citySexRatio === null ? '—' : precise(citySexRatio)),
      metric(t('Employees'), display(totalEmployees)),
      metric(t('Households'), display(totalHouseholds)),
      metric(t('Companies'), display(totalCompanies)),
      metric(t('GDP / personal income'), t('Not provided')),
      metric(t('Profit · exported field'), precise(totalProfit)),
      metric(t('Wage · labor-weighted field'), weightedWage === null ? '—' : precise(weightedWage)),
      metric(t('Area · km²'), precise(sum(districts, 'Area') / 1_000_000)),
      metric(t('Profit per resident · derived'), totalResidents > 0 ? precise(totalProfit / totalResidents) : '—'),
      metric(t('Residents / km² · derived'), totalAreaKm2 > 0 ? precise(totalResidents / totalAreaKm2) : '—'),
      metric(t('Residents per household · derived'), totalHouseholds > 0 ? precise(totalResidents / totalHouseholds) : '—'),
      metric(t('Employees / residents · derived'), totalResidents > 0 ? `${precise(totalEmployees / totalResidents * 100)}%` : '—'),
      metric(t('Companies / 1,000 residents · derived'), totalResidents > 0 ? precise(totalCompanies / totalResidents * 1000) : '—'),
    )
    fragment.append(grid)

    const section = document.createElement('h3')
    section.className = 'skylens-insights-section'
    section.textContent = t('District comparison')
    fragment.append(section, table(districts))

    const note = document.createElement('p')
    note.className = 'skylens-insights-note'
    note.textContent = t('GDP and personal income are not exported as named measures. Profit is the source Profit field; profit per resident is only a derived comparison, not GDP per capita. Wage is the source Wage field (unit not specified), weighted by Labor for the city figure.')
    fragment.append(note)

    const landUseSection = document.createElement('h3')
    landUseSection.className = 'skylens-insights-section'
    landUseSection.textContent = t('Land use by zoning')
    const landUseStatus = document.createElement('div')
    landUseStatus.className = 'skylens-insights-status'
    if (zoningSummary) {
      landUseStatus.textContent = `${display(zoningSummary.totalFeatures)} ${t('Features')} · ${t('approximate polygon area')}`
      const zoningTable = document.createElement('table')
      zoningTable.className = 'skylens-insights-table skylens-zoning-table'
      const head = document.createElement('thead')
      const header = document.createElement('tr')
      const totalZoningArea = zoningSummary.groups.reduce((total, item) => total + item.areaKm2, 0)
      for (const label of ['Zoning / density', 'Features', 'Area · km²', 'Area share']) {
        const cell = document.createElement('th')
        cell.scope = 'col'
        cell.textContent = t(label)
        header.append(cell)
      }
      head.append(header)
      const body = document.createElement('tbody')
      for (const item of zoningSummary.groups) {
        const row = document.createElement('tr')
        for (const value of [translateZoning(item.label), display(item.features), precise(item.areaKm2), totalZoningArea > 0 ? `${precise(item.areaKm2 / totalZoningArea * 100)}%` : '—']) {
          const cell = document.createElement('td')
          cell.textContent = value
          row.append(cell)
        }
        body.append(row)
      }
      zoningTable.append(head, body)
      fragment.append(landUseSection, landUseStatus, zoningTable)
    } else {
      const landUseButton = document.createElement('button')
      landUseButton.className = 'skylens-insights-action'
      landUseButton.type = 'button'
      landUseButton.textContent = t('Calculate zoning areas')
      landUseStatus.textContent = t('Reads the large zoning file only when requested; area is estimated from polygon geometry.')
      landUseButton.addEventListener('click', () => {
        landUseButton.disabled = true
        landUseStatus.textContent = t('Starting zoning analysis…')
        const worker = new Worker(new URL('./zoning-summary.worker.js', location.href))
        worker.onmessage = event => {
          const result = event.data
          if (result.type === 'progress') {
            landUseStatus.textContent = `${t('Reading')} ${display(result.features)} ${t('Features')}…`
            return
          }
          worker.terminate()
          if (result.type === 'error') {
            landUseStatus.textContent = `${t('Zoning analysis failed')}: ${result.message}`
            landUseButton.disabled = false
            return
          }
          cachedZoningSummary = result
          render(panel, districts, zoningUrl, cachedZoningSummary)
        }
        worker.onerror = error => {
          worker.terminate()
          landUseStatus.textContent = t('Zoning analysis failed. The device may not have enough memory for this snapshot.')
          landUseButton.disabled = false
          console.error(error)
        }
        worker.postMessage({ url: zoningUrl })
      })
      fragment.append(landUseSection, landUseButton, landUseStatus)
    }
    const legend = document.createElement('div')
    legend.className = 'skylens-insights-legend'
    const legendTitle = document.createElement('strong')
    legendTitle.textContent = t('Color legend')
    legend.append(legendTitle)
    for (const [name, color] of [['Residential', '#8acb7e'], ['Commercial', '#7bb9ef'], ['Residential + commercial', '#b8e2f2'], ['Office', '#7652a8'], ['Industrial', '#f1cf68'], ['Park', '#a8d99b'], ['Healthcare', '#f3a2b6'], ['Education', '#f6dfa0'], ['Safety', '#a9c9ea'], ['Expressway', '#ffd54f'], ['Arterial road', '#ffe7a3'], ['Collector road', '#fff4d2'], ['Local street', '#fffdf6']]) {
      const item = document.createElement('span')
      item.className = 'skylens-insights-legend-item'
      const swatch = document.createElement('i')
      swatch.style.backgroundColor = color
      item.append(swatch, document.createTextNode(t(name)))
      legend.append(item)
    }
    fragment.append(legend)
    panel.replaceChildren(fragment)
  }

  function start() {
    if (document.getElementById('skylens-insights-button')) return
    const button = document.createElement('button')
    button.id = 'skylens-insights-button'
    button.type = 'button'
    button.textContent = t('City data')
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-controls', 'skylens-insights-panel')

    const panel = document.createElement('section')
    panel.id = 'skylens-insights-panel'
    panel.setAttribute('aria-label', t('City and district statistics'))
    panel.hidden = true
    const status = document.createElement('div')
    status.className = 'skylens-insights-status'
    status.textContent = t('District statistics load when opened.')
    panel.append(status)

    highDetailButton = document.createElement('button')
    highDetailButton.id = 'skylens-high-detail-button'
    highDetailButton.type = 'button'
    highDetailButton.disabled = true
    highDetailButton.textContent = t('High-detail roads')
    highDetailButton.title = t('Loading road surfaces…')
    highDetailButton.addEventListener('click', () => {
      if (highDetailButton.disabled || highDetailLoading) return
      if (highDetailEnabled) {
        highDetailEnabled = false
        highDetailButton.textContent = t('High-detail roads')
        highDetailButton.setAttribute('aria-pressed', 'false')
        window.dispatchEvent(new CustomEvent('skylens:high-detail-toggle', { detail: { enabled: false } }))
        return
      }
      highDetailLoading = true
      highDetailButton.disabled = true
      highDetailButton.textContent = t('Loading road surfaces…')
      window.dispatchEvent(new CustomEvent('skylens:high-detail-toggle', { detail: { enabled: true } }))
    })
    window.addEventListener('skylens:high-detail-status', event => {
      const state = event.detail?.state
      highDetailLoading = state === 'loading'
      if (state === 'ready') {
        highDetailEnabled = true
        highDetailButton.disabled = false
        highDetailButton.textContent = t('High-detail roads: on')
        highDetailButton.setAttribute('aria-pressed', 'true')
        highDetailButton.title = t('High-detail roads: on')
      } else if (state === 'off') {
        highDetailEnabled = false
        highDetailButton.disabled = false
        highDetailButton.textContent = t('High-detail roads')
        highDetailButton.setAttribute('aria-pressed', 'false')
        highDetailButton.title = t('High-detail roads')
      } else if (state === 'error') {
        highDetailEnabled = false
        highDetailButton.disabled = false
        highDetailButton.textContent = t('High-detail roads')
        highDetailButton.title = `${t('High-detail roads failed')}: ${event.detail?.message || ''}`
      }
    })

    let pending = null
    button.addEventListener('click', async () => {
      panel.hidden = !panel.hidden
      button.setAttribute('aria-expanded', String(!panel.hidden))
      if (panel.hidden || panel.dataset.loaded === 'true') return
      if (!pending) pending = loadSummary()
      panel.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'skylens-insights-status',
        textContent: t('Loading district statistics…'),
      }))
      try {
        const summary = await pending
        if (!summary.districts.length) throw new Error(t('No district records in this snapshot.'))
        cachedSummary = summary
        render(panel, summary.districts, summary.zoningUrl)
        panel.dataset.loaded = 'true'
      } catch (error) {
        pending = null
        const message = document.createElement('div')
        message.className = 'skylens-insights-status'
        message.textContent = `${t('Could not load district statistics')}: ${error instanceof Error ? error.message : String(error)}`
        panel.replaceChildren(message)
      }
    })
    const updateLocale = () => {
      button.textContent = t('City data')
      panel.setAttribute('aria-label', t('City and district statistics'))
      highDetailButton.textContent = t(highDetailLoading ? 'Loading road surfaces…' : highDetailEnabled ? 'High-detail roads: on' : 'High-detail roads')
      const toolsTitle = document.querySelector('.skylens-side-tools-title')
      if (toolsTitle) toolsTitle.textContent = t('Map tools')
      syncSidebarHandleLanguage()
      if (cachedSummary && panel.dataset.loaded === 'true') {
        render(panel, cachedSummary.districts, cachedSummary.zoningUrl, cachedZoningSummary)
      }
    }
    new MutationObserver(updateLocale).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    document.body.append(button, panel, highDetailButton)
    updateLocale()
    collapseSidebarOnPhone()
    watchSnapshotStatus()
    observeLayerMenu()
    setupSidebarBehavior()
    observeSideTools()
  }

  function watchSnapshotStatus() {
    const attach = () => {
      const card = document.querySelector('.snapshot-info')
      if (!card || card.dataset.autoHideObserved === 'true') return
      card.dataset.autoHideObserved = 'true'
      let timeout = 0
      const update = () => {
        const ready = /(map ready|地图.*就绪|지도 준비)/i.test(card.textContent || '')
        if (highDetailButton) highDetailButton.disabled = !ready || highDetailLoading
        if (!ready) {
          clearTimeout(timeout)
          timeout = 0
          card.classList.remove('skylens-snapshot-autohide')
          return
        }
        if (!timeout && !card.classList.contains('skylens-snapshot-autohide')) {
          timeout = window.setTimeout(() => card.classList.add('skylens-snapshot-autohide'), 6000)
        }
      }
      new MutationObserver(update).observe(card, { childList: true, subtree: true, characterData: true })
      update()
    }
    attach()
    new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true })
  }

  function mountHighDetailControl() {
    if (!highDetailButton) return
    const menu = document.getElementById('map-layer-menu')
    highDetailButton.classList.add('skylens-in-layer-menu')
    if (!menu) {
      if (!highDetailButton.hidden) highDetailButton.hidden = true
      return
    }
    if (highDetailButton.hidden) highDetailButton.hidden = false
    if (!menu.contains(highDetailButton)) menu.append(highDetailButton)
  }

  function observeLayerMenu() {
    if (layerMenuObserver) return
    layerMenuObserver = new MutationObserver(mountHighDetailControl)
    layerMenuObserver.observe(document.body, { childList: true, subtree: true })
    mountHighDetailControl()
  }

  function integrateSideTools() {
    const panel = document.getElementById('map-sidebar')
    const layerControls = document.querySelector('.map-layer-controls')
    const cityButton = document.getElementById('skylens-insights-button')
    if (!panel || !layerControls || !cityButton) return false

    let tools = document.getElementById('skylens-side-tools')
    if (!tools) {
      tools = document.createElement('section')
      tools.id = 'skylens-side-tools'
      tools.className = 'skylens-side-tools'
      const title = document.createElement('div')
      title.className = 'skylens-side-tools-title'
      title.textContent = t('Map tools')
      tools.append(title)
      const header = panel.querySelector('.panel-header')
      if (header) header.after(tools)
      else panel.prepend(tools)
    }

    const rows = layerControls.querySelector('.map-layer-buttons')
    if (!rows) return false
    if (cityButton.parentElement !== rows) rows.append(cityButton)
    if (layerControls.parentElement !== tools) tools.append(layerControls)

    if (cityButton.dataset.sideBehavior !== 'true') {
      cityButton.dataset.sideBehavior = 'true'
      cityButton.addEventListener('click', () => {
        if (!window.matchMedia('(max-width: 700px)').matches) return
        setTimeout(() => {
          const sidebar = document.getElementById('map-sidebar')
          const toggle = document.querySelector('.sidebar-toggle:not(.is-collapsed)')
          if (sidebar && !sidebar.hidden && toggle) toggle.click()
        }, 0)
      })
    }
    return true
  }

  function observeSideTools() {
    if (sideToolsObserver) return
    const attemptIntegration = () => {
      try {
        return integrateSideTools()
      } catch (error) {
        console.warn('Map tools integration deferred:', error)
        return false
      }
    }
    sideToolsObserver = new MutationObserver(() => {
      attemptIntegration()
    })
    sideToolsObserver.observe(document.body, { childList: true, subtree: true })
    attemptIntegration()
  }

  function setupSidebarBehavior() {
    if (sidebarSheetHandle) return
    const handle = document.createElement('button')
    sidebarSheetHandle = handle
    handle.type = 'button'
    handle.id = 'skylens-sidebar-handle'
    handle.setAttribute('aria-controls', 'map-sidebar')
    handle.hidden = true
    document.body.append(handle)

    let drag = null
    let suppressClick = false
    let observedPanel = null
    const menuLabel = () => t('Menu')
    const sidebar = () => document.getElementById('map-sidebar')
    const toggleButton = () => document.querySelector('.sidebar-toggle')

    const positionHandle = () => {
      const panel = sidebar()
      if (!panel || panel.hidden || !window.matchMedia('(max-width: 700px)').matches) return
      const rect = panel.getBoundingClientRect()
      handle.style.top = `${Math.max(6, rect.top - 15)}px`
      handle.style.bottom = 'auto'
    }

    const applySnap = snap => {
      const panel = sidebar()
      sidebarSnap = snap
      if (!panel) return
      panel.style.removeProperty('height')
      panel.dataset.skylensSheet = snap
      requestAnimationFrame(positionHandle)
    }

    const setHandleState = open => {
      handle.dataset.state = open ? sidebarSnap : 'collapsed'
      handle.textContent = open ? t('Drag · click to close') : `⌃ ${menuLabel()}`
      handle.setAttribute('aria-expanded', String(open))
      handle.setAttribute('aria-label', open ? t('Close') : menuLabel())
      if (!open) {
        handle.style.top = 'auto'
        handle.style.bottom = '58px'
      }
    }

    const sync = () => {
      const panel = sidebar()
      const mobile = window.matchMedia('(max-width: 700px)').matches
      if (!mobile || !panel) {
        handle.hidden = true
        panel?.removeAttribute('data-skylens-sheet')
        return
      }
      handle.hidden = false
      const open = !panel.hidden
      if (open) {
        panel.dataset.skylensSheet = sidebarSnap
        requestAnimationFrame(positionHandle)
      }
      setHandleState(open)
    }

    const bindPanel = () => {
      const panel = sidebar()
      if (!panel || panel === observedPanel) return Boolean(panel)
      sidebarPanelObserver?.disconnect()
      observedPanel = panel
      sidebarPanelObserver = new MutationObserver(sync)
      sidebarPanelObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] })
      sidebarResizeObserver?.disconnect()
      sidebarResizeObserver = new ResizeObserver(positionHandle)
      sidebarResizeObserver.observe(panel)
      sync()
      return true
    }
    if (!bindPanel()) {
      const bodyObserver = new MutationObserver(() => {
        if (bindPanel()) bodyObserver.disconnect()
      })
      bodyObserver.observe(document.body, { childList: true, subtree: true })
    }
    window.addEventListener('resize', sync)

    handle.addEventListener('click', () => {
      if (suppressClick) {
        suppressClick = false
        return
      }
      const panel = sidebar()
      const toggle = toggleButton()
      if (!panel || !toggle) return
      if (panel.hidden) {
        sidebarSnap = 'half'
        applySnap('half')
        toggle.click()
      } else {
        panel.style.removeProperty('height')
        toggle.click()
      }
    })

    handle.addEventListener('pointerdown', event => {
      const panel = sidebar()
      if (!panel || panel.hidden) return
      drag = {
        startY: event.clientY,
        startHeight: panel.getBoundingClientRect().height,
        moved: false,
      }
      handle.setPointerCapture?.(event.pointerId)
    })

    handle.addEventListener('pointermove', event => {
      const panel = sidebar()
      if (!drag || !panel || panel.hidden) return
      const deltaY = event.clientY - drag.startY
      if (Math.abs(deltaY) > 6) drag.moved = true
      if (!drag.moved) return
      const maxHeight = window.innerHeight - 72
      const nextHeight = Math.max(76, Math.min(maxHeight, drag.startHeight - deltaY))
      panel.style.setProperty('height', `${nextHeight}px`, 'important')
      positionHandle()
    })

    const finishDrag = event => {
      const panel = sidebar()
      const toggle = toggleButton()
      if (!drag || !panel || !toggle) return
      const deltaY = event.clientY - drag.startY
      const moved = drag.moved
      drag = null
      handle.releasePointerCapture?.(event.pointerId)
      if (!moved) return
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 0)
      panel.style.removeProperty('height')
      if (deltaY > 70 && sidebarSnap === 'half') {
        toggle.click()
      } else if (deltaY > 70 && sidebarSnap === 'full') {
        applySnap('half')
      } else if (deltaY < -70) {
        applySnap('full')
      } else {
        applySnap(sidebarSnap)
      }
    }
    handle.addEventListener('pointerup', finishDrag)
    handle.addEventListener('pointercancel', event => {
      drag = null
      handle.releasePointerCapture?.(event.pointerId)
      const panel = sidebar()
      panel?.style.removeProperty('height')
      applySnap(sidebarSnap)
    })

    sync()
  }

  function syncSidebarHandleLanguage() {
    if (!sidebarSheetHandle) return
    const collapsed = sidebarSheetHandle.dataset.state === 'collapsed'
    sidebarSheetHandle.textContent = collapsed ? `⌃ ${t('Menu')}` : t('Drag · click to close')
    sidebarSheetHandle.setAttribute('aria-label', collapsed ? t('Menu') : t('Close'))
  }

  function collapseSidebarOnPhone(tries = 12) {
    if (!window.matchMedia('(max-width: 700px)').matches) return
    const button = [...document.querySelectorAll('button')].find(candidate =>
      /^(Collapse sidebar|收起侧栏|사이드바 접기)$/.test(candidate.getAttribute('aria-label') || candidate.title || '')
    )
    if (button) {
      button.click()
      return
    }
    if (tries > 0) setTimeout(() => collapseSidebarOnPhone(tries - 1), 150)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
