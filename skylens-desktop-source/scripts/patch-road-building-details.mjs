#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
// 目标目录不存在（例如还没有打包出 Windows 版）时跳过，而不是直接报 ENOENT 崩溃
const existing = list => list.filter(target => {
  if (existsSync(path.dirname(target))) return true
  console.log(`skip (not found): ${target}`)
  return false
})

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const bundleName = 'index-D7ITdX9e.js'
const targets = [
  path.join(projectRoot, 'skylens-desktop-source/app/assets', bundleName),
  path.join(projectRoot, 'SKYLENS Desktop-0.1.0-win-x64/resources/app/app/assets', bundleName),
  path.join(projectRoot, 'skylens-mobile-android-source/app/src/main/assets/web/assets', bundleName),
]
const workerTargets = [
  path.join(projectRoot, 'skylens-desktop-source/app/assets/network-boundary-lod.worker.js'),
  path.join(projectRoot, 'SKYLENS Desktop-0.1.0-win-x64/resources/app/app/assets/network-boundary-lod.worker.js'),
  path.join(projectRoot, 'skylens-mobile-android-source/app/src/main/assets/web/assets/network-boundary-lod.worker.js'),
]

const directionArrowPatch = `
function roadDirectionPoint(coordinates,direction){
  if(!Array.isArray(coordinates)||coordinates.length<2)return null;
  const segments=[];
  let total=0;
  for(let index=1;index<coordinates.length;index++){
    const start=coordinates[index-1],end=coordinates[index];
    if(!Array.isArray(start)||!Array.isArray(end))continue;
    const latitude=(start[1]+end[1])*Math.PI/360;
    const dx=(end[0]-start[0])*111320*Math.cos(latitude);
    const dy=(end[1]-start[1])*111320;
    const length=Math.hypot(dx,dy);
    if(!(length>0))continue;
    segments.push({start,end,length,bearing:(Math.atan2(dx,dy)*180/Math.PI+360)%360});
    total+=length;
  }
  if(!segments.length)return null;
  let remaining=total/2;
  let selected=segments[segments.length-1];
  for(const segment of segments){
    if(remaining<=segment.length){selected=segment;break}
    remaining-=segment.length;
  }
  const fraction=Math.max(0,Math.min(1,remaining/selected.length));
  const point=[
    selected.start[0]+(selected.end[0]-selected.start[0])*fraction,
    selected.start[1]+(selected.end[1]-selected.start[1])*fraction,
  ];
  const bearing=(selected.bearing+(direction==="Backward"?180:0)+360)%360;
  return {point,bearing};
}
function installRoadDirectionArrows(e,t){
  const features=[];
  for(const feature of t.features){
    const properties=feature?.properties??{};
    const objects=String(properties.Object??"").split(",").map(value=>value.trim());
    const direction=String(properties.Direction??"");
    if(!objects.includes("Road")||direction==="Both"||!["Forward","Backward"].includes(direction))continue;
    const sample=roadDirectionPoint(feature.geometry?.coordinates,direction);
    if(!sample)continue;
    features.push({type:"Feature",properties:{bearing:sample.bearing,direction},geometry:{type:"Point",coordinates:sample.point}});
  }
  const canvas=document.createElement("canvas");
  canvas.width=32;
  canvas.height=32;
  const context=canvas.getContext("2d");
  if(!context)throw new Error("Could not draw road direction arrow");
  context.translate(16,16);
  context.beginPath();
  context.moveTo(0,-11);
  context.lineTo(9,9);
  context.lineTo(0,4);
  context.lineTo(-9,9);
  context.closePath();
  context.fillStyle="#263a35";
  context.fill();
  context.lineWidth=2.5;
  context.strokeStyle="#fffdf6";
  context.stroke();
  e.addImage("road-direction-arrow",context.getImageData(0,0,32,32),{pixelRatio:2});
  e.addSource("road-direction-arrows",{type:"geojson",data:{type:"FeatureCollection",features}});
  e.addLayer({
    id:"road-direction-arrows",
    type:"symbol",
    source:"road-direction-arrows",
    minzoom:14,
    layout:{
      "icon-image":"road-direction-arrow",
      "icon-size":["interpolate",["linear"],["zoom"],13,.55,17,.9],
      "icon-rotate":["get","bearing"],
      "icon-rotation-alignment":"map",
      "icon-pitch-alignment":"map",
      "icon-allow-overlap":!1,
      "icon-ignore-placement":!1
    },
    paint:{"icon-opacity":.9}
  },"road-name-label");
}
`

const networkBoundaryWorker = `'use strict'

const METERS_PER_DEGREE = 111320

function segmentDistanceSquared(point, start, end) {
  const latitude = (point[1] + start[1] + end[1]) * Math.PI / 540
  const xScale = METERS_PER_DEGREE * Math.cos(latitude)
  const px = point[0] * xScale
  const py = point[1] * METERS_PER_DEGREE
  const ax = start[0] * xScale
  const ay = start[1] * METERS_PER_DEGREE
  const bx = end[0] * xScale
  const by = end[1] * METERS_PER_DEGREE
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const fraction = lengthSquared
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    : 0
  const x = ax + fraction * dx - px
  const y = ay + fraction * dy - py
  return x * x + y * y
}

function simplifyRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length <= 3) return ring
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const source = closed ? ring.slice(0, -1) : ring
  if (source.length <= 3) return ring

  const threshold = tolerance * tolerance
  const keep = new Uint8Array(source.length)
  keep[0] = 1
  keep[source.length - 1] = 1
  const stack = [[0, source.length - 1]]

  while (stack.length) {
    const [first, last] = stack.pop()
    let farthest = threshold
    let index = -1
    for (let current = first + 1; current < last; current += 1) {
      const distance = segmentDistanceSquared(source[current], source[first], source[last])
      if (distance > farthest) {
        farthest = distance
        index = current
      }
    }
    if (index >= 0) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const output = []
  for (let index = 0; index < source.length; index += 1) {
    if (!keep[index]) continue
    const point = source[index]
    output.push([
      Number(point[0].toFixed(7)),
      Number(point[1].toFixed(7)),
      ...(point.length > 2 ? [Number(point[2].toFixed(3))] : []),
    ])
  }
  if (output.length < 3) return ring
  if (closed) output.push(output[0].slice())
  return output
}

self.onmessage = async event => {
  try {
    const response = await fetch(event.data.url, { cache: 'force-cache' })
    if (!response.ok) throw new Error(\`Network_Boundary.json request failed (HTTP \${response.status})\`)
    const source = await response.json()
    const tolerance = Number(event.data.tolerance) || 1.5
    const features = []

    for (const feature of source.features ?? []) {
      if (feature?.geometry?.type !== 'Polygon' || !Array.isArray(feature.geometry.coordinates)) continue
      features.push({
        type: 'Feature',
        properties: feature.properties ?? {},
        geometry: {
          type: 'Polygon',
          coordinates: feature.geometry.coordinates.map(ring => simplifyRing(ring, tolerance)),
        },
      })
    }

    const originalPoints = source.features.reduce(
      (total, feature) => total + (feature.geometry?.coordinates ?? []).reduce((sum, ring) => sum + ring.length, 0),
      0,
    )
    const simplifiedPoints = features.reduce(
      (total, feature) => total + feature.geometry.coordinates.reduce((sum, ring) => sum + ring.length, 0),
      0,
    )
    self.postMessage({
      type: 'done',
      data: { type: 'FeatureCollection', features },
      originalPoints,
      simplifiedPoints,
    })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
`

const patches = [
  {
    name: 'Korean field labels',
    marker: 'age:"주민 연령"',
    from: 'zoning:"용도지역",resident:"거주자",employee:"근로자"',
    to: 'zoning:"용도지역",resident:"거주자",age:"건축 연령",level:"층수",household:"가구 수",labor:"노동 인구",residentMale:"남성 주민",residentFemale:"여성 주민",product:"생산품",profit:"이익",wage:"임금",theme:"테마",elevation:"표고",zone:"구역",width:"폭",volume:"교통량",employee:"근로자"',
  },
  {
    name: 'English field labels',
    marker: 'age:"Resident age"',
    from: 'zoning:"Zoning",resident:"Residents",employee:"Employees"',
    to: 'zoning:"Zoning",resident:"Residents",age:"Building age",level:"Levels",household:"Households",labor:"Labor force",residentMale:"Male residents",residentFemale:"Female residents",product:"Product",profit:"Profit",wage:"Wage",theme:"Theme",elevation:"Elevation",zone:"Zone",width:"Width",volume:"Traffic volume",employee:"Employees"',
  },
  {
    name: 'Chinese field labels',
    marker: '"age":"居民年龄"',
    from: '"zoning":"分区类型","resident":"居民","employee":"员工"',
    to: '"zoning":"分区类型","resident":"居民","age":"建筑年龄","level":"楼层","household":"家庭数","labor":"劳动人口","residentMale":"男性居民","residentFemale":"女性居民","product":"产品","profit":"利润","wage":"工资","theme":"主题","elevation":"高程","zone":"分区","width":"宽度","volume":"交通量","employee":"员工"',
  },
  {
    name: 'Korean detail group labels',
    marker: 'buildingBasics:"건물 기본 정보"',
    from: 'age:"건축 연령"',
    to: 'buildingBasics:"건물 기본 정보",buildingPopulation:"인구와 거주",buildingEconomy:"경제와 고용",roadBasics:"도로 기본 정보",roadTraffic:"도로 용량과 교통",routeDetails:"노선 정보",facilityDetails:"시설 정보",age:"건축 연령"',
  },
  {
    name: 'English detail group labels',
    marker: 'buildingBasics:"Building basics"',
    from: 'age:"Building age"',
    to: 'buildingBasics:"Building basics",buildingPopulation:"Population and housing",buildingEconomy:"Economy and employment",roadBasics:"Road basics",roadTraffic:"Road capacity and traffic",routeDetails:"Route details",facilityDetails:"Facility details",age:"Building age"',
  },
  {
    name: 'Chinese detail group labels',
    marker: '"buildingBasics":"建筑基本信息"',
    from: '"age":"建筑年龄"',
    to: '"buildingBasics":"建筑基本信息","buildingPopulation":"人口与居住","buildingEconomy":"经济与就业","roadBasics":"道路基本信息","roadTraffic":"道路能力与交通","routeDetails":"线路详情","facilityDetails":"设施详情","age":"建筑年龄"',
  },
  {
    name: 'Zone-aware building fields',
    marker: 'function buildingFieldRelevant(',
    from: 'function t6({selection:e,routeStops:t,buildingRoutes:i,poiState:r,routeState:a,onClose:o,onBack:s,onStopFocus:u,onBuildingRouteSelect:h,onDirectionsPlace:f}){',
    to: `function buildingFieldRelevant(e,t){
  const value=e[t];
  if(value===0||value===""||value==null)return!1;
  const zoning=String(e.Zoning??"");
  const residential=zoning.includes("Residential");
  const commercial=zoning.includes("Commercial");
  const office=zoning.includes("Office");
  const industrial=zoning.includes("Industrial");
  if(!(residential||commercial||office||industrial))return!0;
  if(["Age","Household","Labor","Resident_Male","Resident_Female"].includes(t))return residential;
  if(["Product","Profit"].includes(t))return commercial||office||industrial;
  if(t==="Employee")return commercial||office||industrial||(residential&&Number(value)>0);
  if(t==="Wage")return residential;
  if(t==="Level")return residential||commercial||office||industrial;
  return!0;
}
function t6({selection:e,routeStops:t,buildingRoutes:i,poiState:r,routeState:a,onClose:o,onBack:s,onStopFocus:u,onBuildingRouteSelect:h,onDirectionsPlace:f}){`,
  },
  {
    name: 'Filter building fields by zoning',
    marker: 'function detailFieldElements(',
    from: 'b.filter(([C])=>Ru(g[C])).map',
    to: 'b.filter(([C])=>Ru(g[C])&&(v!=="building"||buildingFieldRelevant(g,C))).map',
  },
  {
    name: 'Grouped detail fields',
    marker: 'function detailFieldElements(',
    from: 'function t6({selection:e,routeStops:t,buildingRoutes:i,poiState:r,routeState:a,onClose:o,onBack:s,onStopFocus:u,onBuildingRouteSelect:h,onDirectionsPlace:f}){',
    to: `function detailFieldGroup(e,t){
  if(e==="road")return["Width","Volume","Lane","Limit"].includes(t)?"roadTraffic":"roadBasics";
  if(e==="building"){
    if(["Age","Level","Household","Labor","Resident_Male","Resident_Female"].includes(t))return"buildingPopulation";
    if(["Employee","Product","Wage","Profit"].includes(t))return"buildingEconomy";
    return"buildingBasics";
  }
  if(e==="route")return"routeDetails";
  return"facilityDetails";
}
function detailFieldElements(e,t,i,r,a){
  let group="";
  const output=[];
  for(const[key,label]of t){
    if(!Ru(i[key])||e==="building"&&!buildingFieldRelevant(i,key))continue;
    const next=detailFieldGroup(e,key);
    if(next!==group){
      group=next;
      output.push(J.jsx("div",{className:"detail-field-group-title",children:r(group)},"group-"+group));
    }
    output.push(J.jsxs("div",{children:[J.jsx("dt",{children:r(label)}),J.jsx("dd",{children:a(i[key])})]},key));
  }
  return output;
}
function t6({selection:e,routeStops:t,buildingRoutes:i,poiState:r,routeState:a,onClose:o,onBack:s,onStopFocus:u,onBuildingRouteSelect:h,onDirectionsPlace:f}){`,
  },
  {
    name: 'Render grouped detail fields',
    marker: 'detailFieldElements(v,b,g,d,',
    from: 'b.filter(([C])=>Ru(g[C])&&(v!=="building"||buildingFieldRelevant(g,C))).map(([C,R])=>J.jsxs("div",{children:[J.jsx("dt",{children:d(R)}),J.jsx("dd",{children:Iu(g[C],m)})]},C))',
    to: 'detailFieldElements(v,b,g,d,C=>Iu(C,m))',
  },
  {
    name: 'Selection property guard',
    marker: 'properties:g={},kind:v',
    from: 'const{t:d,language:m}=ls(),{properties:g,kind:v,id:x}=e,',
    to: 'const{t:d,language:m}=ls(),{properties:g={},kind:v,id:x}=(e??{}),',
  },
  {
    name: 'Building detail fields',
    marker: '["Resident_Male","residentMale"]',
    from: 'const KR=[["Asset","asset"],["Category","category"],["Zoning","zoning"],["Resident","resident"],["Employee","employee"]]',
    to: 'const KR=[["Age","age"],["Level","level"],["Household","household"],["Labor","labor"],["Resident_Male","residentMale"],["Resident_Female","residentFemale"],["Employee","employee"],["Product","product"],["Wage","wage"],["Profit","profit"],["Zone","zone"],["Theme","theme"],["Elevation","elevation"],["Asset","asset"],["Category","category"],["Zoning","zoning"]]',
  },
  {
    name: 'Road detail fields',
    marker: '["Volume","volume"]',
    from: ',WR=[["Asset","asset"],["Category","category"],["Lane","lane"],["Limit","limit"],["Direction","direction"],["Form","form"]]',
    to: ',WR=[["Width","width"],["Volume","volume"],["Lane","lane"],["Limit","limit"],["Direction","direction"],["Form","form"],["Elevation","elevation"],["Length","length"],["Asset","asset"],["Category","category"]]',
  },
  {
    name: 'Roads layer group',
    marker: '"road-direction-arrows"',
    from: 'roads:{label:"도로",source:"network",layers:["road-casing","road-line"]',
    to: 'roads:{label:"도로",source:"network",layers:["road-casing","road-line","road-direction-arrows"]',
  },
  {
    name: 'Direction arrow implementation',
    marker: 'function installRoadDirectionArrows(',
    from: 'function T6(e){',
    to: directionArrowPatch + 'function T6(e){',
  },
  {
    name: 'Install direction arrows',
    marker: 'installRoadDirectionArrows(w,a)',
    from: 'T6(w),D6(w,f);',
    to: 'T6(w),D6(w,f),installRoadDirectionArrows(w,a);',
  },
  {
    name: 'High-detail feature IDs',
    marker: 'R.features.forEach((F,I)=>F.id=I)',
    from: 'function Y(R){const P=w.getSource("network-boundary");',
    to: 'function Y(R){R.features.forEach((F,I)=>F.id=I);const P=w.getSource("network-boundary");',
  },
  {
    name: 'High-detail worker loader',
    marker: 'loadNetworkBoundaryLod',
    from: 'return{configure:r,loadCollection:a,loadExtraInfo:o,loadWaterImage:s}}',
    to: `async function c(){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("./network-boundary-lod.worker.js",import.meta.url),{type:"module"});
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error("High-detail road preparation timed out"))},60000);
    const finish=()=>{clearTimeout(timeout);worker.terminate()};
    worker.onmessage=event=>{
      const message=event.data??{};
      if(message.type==="done"&&message.data?.features){
        finish();
        resolve(message.data);
      }else if(message.type==="error"){
        finish();
        reject(new Error(message.message||"High-detail road preparation failed"));
      }
    };
    worker.onerror=event=>{
      finish();
      reject(new Error(event.message||"High-detail road worker failed"));
    };
    worker.postMessage({url:\`\${e}/GeoJSON/Network_Boundary.json\`,tolerance:1.5});
  });
}
return{configure:r,loadCollection:a,loadExtraInfo:o,loadWaterImage:s,loadNetworkBoundaryLod:c}}`,
  },
  {
    name: 'Use simplified high-detail geometry',
    marker: '()=>t.loadNetworkBoundaryLod()',
    from: 'loadNetworkBoundary:d=>u("networkBoundary",()=>t.loadCollection("Network_Boundary.json","Polygon"),d,m=>m.features.length===0)',
    to: 'loadNetworkBoundary:d=>u("networkBoundary",()=>t.loadNetworkBoundaryLod(),d,m=>m.features.length===0)',
  },
  {
    name: 'Select elevated and tunnel roads',
    marker: 'layers:["road-line","road-elevated-line","road-tunnel-line"]',
    from: 'M=D||w||A?void 0:e.queryRenderedFeatures([[x.x-v,x.y-v],[x.x+v,x.y+v]],{layers:["road-line"]})[0]',
    to: 'M=D||w||A?void 0:e.queryRenderedFeatures([[x.x-v,x.y-v],[x.x+v,x.y+v]],{layers:["road-line","road-elevated-line","road-tunnel-line"].filter(F=>e.getLayer(F))})[0]',
  },
  {
    name: 'Pointer cursor for elevated and tunnel roads',
    marker: '["road-line","road-elevated-line","road-tunnel-line"].filter(D=>e.getLayer(D))',
    from: 'A=T||e.queryRenderedFeatures([[v.x-6,v.y-6],[v.x+6,v.y+6]],{layers:["road-line"]}).length>0',
    to: 'A=T||e.queryRenderedFeatures([[v.x-6,v.y-6],[v.x+6,v.y+6]],{layers:["road-line","road-elevated-line","road-tunnel-line"].filter(D=>e.getLayer(D))}).length>0',
  },
  {
    name: 'Reduce direction-arrow clutter',
    marker: 'id:"road-direction-arrows",\n    type:"symbol",\n    source:"road-direction-arrows",\n    minzoom:14',
    from: 'id:"road-direction-arrows",\n    type:"symbol",\n    source:"road-direction-arrows",\n    minzoom:13',
    to: 'id:"road-direction-arrows",\n    type:"symbol",\n    source:"road-direction-arrows",\n    minzoom:14',
  },
  {
    name: 'Public facility icon colors',
    marker: 'parking:"#2d7fb8"',
    from: 'const kp={landmark:"#ff6a00",venue:"#a600ff",hospital:"#ff006e",school:"#555b63",police:"#555b63",admin:"#555b63",museum:"#b45309",hotel:"#b45309",restaurant:"#b45309"}',
    to: 'const kp={landmark:"#ff6a00",venue:"#a600ff",hospital:"#ff006e",school:"#315f91",police:"#315f91",admin:"#315f91",parking:"#2d7fb8",fire:"#c94b32",park:"#3f8a56",utility:"#7a6b32",museum:"#b45309",hotel:"#b45309",restaurant:"#b45309"}',
  },
  {
    name: 'Public facility icon classification',
    marker: 'if(i.includes("Parking"))return"parking"',
    from: 'function _6(e,t){const i=Ye(e,"Category").split(",").map(u=>u.trim());if(i.includes("Extension"))return null;if(!i.includes("Transportation")&&!i.includes("Parking")&&/dome|stadium|arena|coliseum/i.test(Ye(e,"Name")))return"venue";if(i.includes("Fire"))return null;for(const[u,h]of[["Police","police"],["Education","school"],["Health","hospital"]])if(i.includes(u))return h;if(i.includes("Transportation")||i.includes("Parking"))return null;const r=$t(Ye(e,"Asset")),a=$t(Ye(e,"Product")),o=r||$t(Ye(e,"Name"));if(i.includes("Public")||i.includes("Property")&&Ye(e,"Zoning")==="Commercial"){const u=p6[r];if(u)return u;if(m6.test(o))return"museum";if(g6.test(o)||/^(accommodation|lodging|숙박 시설|숙박시설)$/.test(a))return"hotel";if((y6.test(o)||/^(meals|식사)$/.test(a))&&(t>=1e3||typeof e.Employee=="number"&&e.Employee>=50))return"restaurant"}return i.includes("Admin")?"admin":null}',
    to: `function _6(e,t){
  const i=Ye(e,"Category").split(",").map(u=>u.trim());
  if(i.includes("Extension"))return null;
  if(!i.includes("Transportation")&&!i.includes("Parking")&&/dome|stadium|arena|coliseum/i.test(Ye(e,"Name")))return"venue";
  if(i.includes("Parking"))return"parking";
  if(i.includes("Fire"))return"fire";
  for(const[u,h]of[["Police","police"],["Education","school"],["Health","hospital"]])if(i.includes(u))return h;
  if(i.includes("Transportation"))return null;
  const r=$t(Ye(e,"Asset")),a=$t(Ye(e,"Product")),o=r||$t(Ye(e,"Name"));
  if(i.includes("Public")||i.includes("Property")&&Ye(e,"Zoning")==="Commercial"){
    const u=p6[r];
    if(u)return u;
    if(m6.test(o))return"museum";
    if(g6.test(o)||/^(accommodation|lodging|숙박 시설|숙박시설)$/.test(a))return"hotel";
    if((y6.test(o)||/^(meals|식사)$/.test(a))&&(t>=1e3||typeof e.Employee=="number"&&e.Employee>=50))return"restaurant";
  }
  if(i.includes("Admin"))return"admin";
  if(i.includes("Park"))return"park";
  if(["Power","Water","Waste","Sewage","Communication","Maintenance","Disaster"].some(u=>i.includes(u)))return"utility";
  return null;
}`,
  },
  {
    name: 'Public facility icon paths',
    marker: 'parking:"M8 5V19',
    from: 'const v6={landmark:"M12 4L14.5 9L20 10L16 14L17 20L12 17L7 20L8 14L4 10L9.5 9Z",venue:"M4 10C4 4 20 4 20 10V15C20 21 4 21 4 15Z M4 10C4 16 20 16 20 10 M8 14V18 M12 15V19 M16 14V18 M8 10C8 7 16 7 16 10C16 13 8 13 8 10Z",school:',
    to: 'const v6={landmark:"M12 4L14.5 9L20 10L16 14L17 20L12 17L7 20L8 14L4 10L9.5 9Z",venue:"M4 10C4 4 20 4 20 10V15C20 21 4 21 4 15Z M4 10C4 16 20 16 20 10 M8 14V18 M12 15V19 M16 14V18 M8 10C8 7 16 7 16 10C16 13 8 13 8 10Z",parking:"M8 5V19 M8 5H13Q17 5 17 9Q17 13 13 13H8",fire:"M12 3C12 7 8 8 8 13C8 17 10 20 12 21C15 20 17 17 17 14C17 11 15 10 14 8C14 11 12 11 12 3Z",park:"M12 3L5 11H9L4 17H20L15 11H19Z M12 17V21",utility:"M13 3L6 13H11L10 21L18 10H13Z",school:',
  },
  {
    name: 'Show new public facility icon tiers',
    marker: 'm==="parking"||m==="fire"',
    from: 'if(m==="museum"||m==="hotel"||m==="restaurant"||m==="venue")w=m==="museum"||m==="venue"?110:m==="hotel"?100:85,S=m==="restaurant"?2:1;',
    to: 'if(m==="museum"||m==="hotel"||m==="restaurant"||m==="venue"||m==="parking"||m==="fire"||m==="park"||m==="utility")w=m==="museum"||m==="venue"?110:m==="hotel"?100:m==="restaurant"?85:m==="fire"?90:m==="parking"?80:70,S=m==="restaurant"?2:1;',
  },
  {
    name: 'Correct utility facility icons',
    marker: 'return"communication"',
    from: `function _6(e,t){
  const i=Ye(e,"Category").split(",").map(u=>u.trim());
  if(i.includes("Extension"))return null;
  if(!i.includes("Transportation")&&!i.includes("Parking")&&/dome|stadium|arena|coliseum/i.test(Ye(e,"Name")))return"venue";
  if(i.includes("Parking"))return"parking";
  if(i.includes("Fire"))return"fire";
  for(const[u,h]of[["Police","police"],["Education","school"],["Health","hospital"]])if(i.includes(u))return h;
  if(i.includes("Transportation"))return null;
  const r=$t(Ye(e,"Asset")),a=$t(Ye(e,"Product")),o=r||$t(Ye(e,"Name"));
  if(i.includes("Public")||i.includes("Property")&&Ye(e,"Zoning")==="Commercial"){
    const u=p6[r];
    if(u)return u;
    if(m6.test(o))return"museum";
    if(g6.test(o)||/^(accommodation|lodging|숙박 시설|숙박시설)$/.test(a))return"hotel";
    if((y6.test(o)||/^(meals|식사)$/.test(a))&&(t>=1e3||typeof e.Employee=="number"&&e.Employee>=50))return"restaurant";
  }
  if(i.includes("Admin"))return"admin";
  if(i.includes("Park"))return"park";
  if(["Power","Water","Waste","Sewage","Communication","Maintenance","Disaster"].some(u=>i.includes(u)))return"utility";
  return null;
}`,
    to: `function _6(e,t){
  const i=Ye(e,"Category").split(",").map(u=>u.trim());
  if(i.includes("Extension"))return null;
  if(!i.includes("Transportation")&&!i.includes("Parking")&&/dome|stadium|arena|coliseum/i.test(Ye(e,"Name")))return"venue";
  if(i.includes("Fire"))return"fire";
  for(const[u,h]of[["Police","police"],["Education","school"],["Health","hospital"]])if(i.includes(u))return h;
  if(i.includes("Waste")||i.includes("Landfill"))return"garbage";
  if(i.includes("Sewage"))return"sewage";
  if(i.includes("Disaster"))return"shelter";
  if(i.includes("Mortuary"))return"cemetery";
  if(i.includes("Post"))return"post";
  if(i.includes("Research"))return"research";
  if(i.includes("Maintenance")||i.includes("Construction"))return"maintenance";
  if(i.includes("Power"))return"power";
  if(i.includes("Water"))return"water";
  if(i.includes("Communication")||i.includes("Telecom"))return"communication";
  if(i.includes("Park"))return"park";
  if(i.includes("Parking"))return"parking";
  if(i.includes("Transportation"))return null;
  const r=$t(Ye(e,"Asset")),a=$t(Ye(e,"Product")),o=r||$t(Ye(e,"Name"));
  if(i.includes("Public")||i.includes("Property")&&Ye(e,"Zoning")==="Commercial"){
    const u=p6[r];
    if(u)return u;
    if(m6.test(o))return"museum";
    if(g6.test(o)||/^(accommodation|lodging|숙박 시설|숙박시설)$/.test(a))return"hotel";
    if((y6.test(o)||/^(meals|식사)$/.test(a))&&(t>=1e3||typeof e.Employee=="number"&&e.Employee>=50))return"restaurant";
  }
  if(i.includes("Admin"))return"admin";
  return null;
}`,
  },
  {
    name: 'Correct utility facility icon colors',
    marker: 'power:"#b7791f"',
    from: 'fire:"#c94b32",park:"#3f8a56",utility:"#7a6b32"',
    to: 'fire:"#c94b32",park:"#3f8a56",power:"#b7791f",water:"#2d7fb8",garbage:"#5f7a35",sewage:"#6f6b8f",communication:"#6c5aa8",maintenance:"#8a6848",shelter:"#c94b32",post:"#315f91",cemetery:"#6b7280",research:"#7055a3",utility:"#7a6b32"',
  },
  {
    name: 'Correct utility facility icon paths',
    marker: 'communication:"M12 21V10',
    from: 'utility:"M13 3L6 13H11L10 21L18 10H13Z",school:',
    to: 'power:"M13 3L6 13H11L10 21L18 10H13Z",water:"M12 3C12 3 6 10 6 14A6 6 0 0 0 18 14C18 10 12 3 12 3Z",garbage:"M6 7H18 M9 7V4H15V7 M8 7L9 21H15L16 7 M10 11V17 M14 11V17",sewage:"M4 17H20 M6 17C6 13 9 11 12 8C15 11 18 13 18 17A6 6 0 0 1 6 17Z M8 20H16",communication:"M12 21V10 M8 5C10 3 14 3 17 5 M5 8C8 5 16 5 19 8 M9 11H15V14H9Z M9 14L6 18 M15 14L18 18",maintenance:"M14 6A5 5 0 0 0 7 12L3 16L6 19L10 15A5 5 0 0 0 16 8L13 11L11 9Z",shelter:"M4 11L12 4L20 11V20H4Z M9 20V14H15V20",post:"M3 6H21V18H3Z M3 7L12 13L21 7",cemetery:"M7 21V11A5 5 0 0 1 17 11V21 M10 12H14 M12 10V14",research:"M9 3H15 M10 3V9L6 19H18L14 9V3 M8 15H16",utility:"M13 3L6 13H11L10 21L18 10H13Z",school:',
  },
  {
    name: 'Correct utility facility icon tiers',
    marker: 'm==="communication"',
    from: 'if(m==="museum"||m==="hotel"||m==="restaurant"||m==="venue"||m==="parking"||m==="fire"||m==="park"||m==="utility")w=m==="museum"||m==="venue"?110:m==="hotel"?100:m==="restaurant"?85:m==="fire"?90:m==="parking"?80:70,S=m==="restaurant"?2:1;',
    to: 'if(m==="museum"||m==="hotel"||m==="restaurant"||m==="venue"||m==="parking"||m==="fire"||m==="park"||m==="power"||m==="water"||m==="garbage"||m==="sewage"||m==="communication"||m==="maintenance"||m==="shelter"||m==="post"||m==="cemetery"||m==="research"||m==="utility")w=m==="museum"||m==="venue"?110:m==="hotel"?100:m==="fire"?90:m==="restaurant"||m==="water"||m==="garbage"?85:m==="parking"||m==="communication"||m==="research"?80:m==="power"?75:70,S=m==="restaurant"?2:1;',
  },
  {
    name: 'Darken office building fill',
    marker: '["in","Office",["to-string",["get","Zoning"]]],"#7652a8"',
    from: '["in","Office",["to-string",["get","Zoning"]]],"#b69bdf"',
    to: '["in","Office",["to-string",["get","Zoning"]]],"#7652a8"',
  },
  {
    name: 'Resident age label Korean',
    marker: 'age:"주민 연령"',
    from: 'age:"건축 연령",level:"층수"',
    to: 'age:"주민 연령",level:"건물 등급"',
  },
  {
    name: 'Resident age label English',
    marker: 'age:"Resident age"',
    from: 'age:"Building age",level:"Levels"',
    to: 'age:"Resident age",level:"Building level"',
  },
  {
    name: 'Resident age label Chinese',
    marker: '"age":"居民年龄"',
    from: '"age":"建筑年龄","level":"楼层"',
    to: '"age":"居民年龄","level":"建筑等级"',
  },
  {
    name: 'Resident age section Korean',
    marker: 'facilityDetails:"시설 정보",age:"주민 연령"',
    from: 'facilityDetails:"시설 정보",age:"건축 연령"',
    to: 'facilityDetails:"시설 정보",age:"주민 연령"',
  },
  {
    name: 'Resident age section English',
    marker: 'facilityDetails:"Facility details",age:"Resident age"',
    from: 'facilityDetails:"Facility details",age:"Building age"',
    to: 'facilityDetails:"Facility details",age:"Resident age"',
  },
  {
    name: 'Resident age section Chinese',
    marker: '"facilityDetails":"设施详情","age":"居民年龄"',
    from: '"facilityDetails":"设施详情","age":"建筑年龄"',
    to: '"facilityDetails":"设施详情","age":"居民年龄"',
  },
  {
    name: 'Basic zoning label colors',
    marker: 'function zoneLabelColor(',
    from: 'function _Z(e){',
    to: `function zoneLabelColor(e){
  const zoning=Ye(e,"Zoning");
  if(zoning.includes("Residential")&&zoning.includes("Commercial"))return"#287b72";
  if(zoning.includes("Residential"))return"#2f7d46";
  if(zoning.includes("Commercial"))return"#2f6f9f";
  if(zoning.includes("Office"))return"#7055a3";
  if(zoning.includes("Industrial"))return"#966815";
  return"#34513f";
}
function _Z(e){`,
  },
  {
    name: 'Apply zoning label colors',
    marker: 'color:m?kp[m]:zoneLabelColor(d)',
    from: 'color:m?kp[m]:"#34513f",hoverColor:Dr(m?kp[m]:"#34513f"),pressColor:Dr(Dr(m?kp[m]:"#34513f"))',
    to: 'color:m?kp[m]:zoneLabelColor(d),hoverColor:Dr(m?kp[m]:zoneLabelColor(d)),pressColor:Dr(Dr(m?kp[m]:zoneLabelColor(d)))',
  },
]

const disableHighDetailClickPatches = [
  {
    name: 'Remove high-detail click query',
    from: 'M=D||w||A?void 0:e.queryRenderedFeatures([[x.x-v,x.y-v],[x.x+v,x.y+v]],{layers:["road-line","network-boundary-fill"].filter(F=>e.getLayer(F))})[0]',
    to: 'M=D||w||A?void 0:e.queryRenderedFeatures([[x.x-v,x.y-v],[x.x+v,x.y+v]],{layers:["road-line"]})[0]',
  },
  {
    name: 'Remove high-detail synthetic selection',
    from: 'R=(C?.source==="network-boundary"&&C.properties?{selection:{id:`network-boundary:${C.id}`,sourceFeatureId:C.id,kind:"road",properties:{...C.properties}},geometry:C.geometry}:null)??(C?.id===void 0?null:t.get(`${C.source}:${C.id}`)??null)',
    to: 'R=C?.id===void 0?null:t.get(`${C.source}:${C.id}`)??null',
  },
  {
    name: 'Remove high-detail pointer cursor',
    from: 'A=T||e.queryRenderedFeatures([[v.x-6,v.y-6],[v.x+6,v.y+6]],{layers:["road-line","network-boundary-fill"].filter(D=>e.getLayer(D))}).length>0',
    to: 'A=T||e.queryRenderedFeatures([[v.x-6,v.y-6],[v.x+6,v.y+6]],{layers:["road-line"]}).length>0',
  },
]

// 这几项涉及的道路图层列表 / 箭头图层，之后由 patch-road-style.mjs 接管并改写（分层、多层高架、分层箭头），
// 所以在已经运行过 patch-road-style 的网页包上，它们的“已打过补丁”标记会找不到——这种情况视为已完成，而不是报错。
const SUPERSEDED_BY_ROAD_STYLE = new Set([
  'Select elevated and tunnel roads',
  'Pointer cursor for elevated and tunnel roads',
  'Reduce direction-arrow clutter',
])

function applyPatch(source, patch) {
  if (source.includes(patch.marker)) return { source, changed: false }
  if (SUPERSEDED_BY_ROAD_STYLE.has(patch.name) && source.includes('/*skylens-road-style:begin*/')) {
    return { source, changed: false }
  }
  const first = source.indexOf(patch.from)
  if (first < 0) throw new Error(`${patch.name}: target fragment was not found`)
  if (source.indexOf(patch.from, first + patch.from.length) >= 0) {
    throw new Error(`${patch.name}: target fragment is ambiguous`)
  }
  return { source: source.slice(0, first) + patch.to + source.slice(first + patch.from.length), changed: true }
}

for (const target of existing(targets)) {
  let source = await readFile(target, 'utf8')
  const applied = []
  for (const patch of patches) {
    const result = applyPatch(source, patch)
    source = result.source
    if (result.changed) applied.push(patch.name)
  }
  for (const patch of disableHighDetailClickPatches) {
    const first = source.indexOf(patch.from)
    if (first < 0) continue
    if (source.indexOf(patch.from, first + patch.from.length) >= 0) {
      throw new Error(`${patch.name}: target fragment is ambiguous`)
    }
    source = source.slice(0, first) + patch.to + source.slice(first + patch.from.length)
    applied.push(patch.name)
  }
  if (applied.length) await writeFile(target, source)
  console.log(`${path.relative(projectRoot, target)}: ${applied.length ? `patched ${applied.length} item(s)` : 'already patched'}`)
}

for (const target of existing(workerTargets)) {
  let current = null
  try {
    current = await readFile(target, 'utf8')
  } catch {}
  if (current === networkBoundaryWorker) {
    console.log(`${path.relative(projectRoot, target)}: already current`)
    continue
  }
  await writeFile(target, networkBoundaryWorker)
  console.log(`${path.relative(projectRoot, target)}: worker updated`)
}
