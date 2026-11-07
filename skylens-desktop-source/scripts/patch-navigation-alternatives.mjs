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
const workerName = 'routing.worker-B8mGiyHX.js'
const bundleName = 'index-D7ITdX9e.js'
const workerTargets = [
  path.join(projectRoot, 'skylens-desktop-source/app/assets', workerName),
  path.join(projectRoot, 'SKYLENS Desktop-0.1.0-win-x64/resources/app/app/assets', workerName),
  path.join(projectRoot, 'skylens-mobile-android-source/app/src/main/assets/web/assets', workerName),
]
const bundleTargets = [
  path.join(projectRoot, 'skylens-desktop-source/app/assets', bundleName),
  path.join(projectRoot, 'SKYLENS Desktop-0.1.0-win-x64/resources/app/app/assets', bundleName),
  path.join(projectRoot, 'skylens-mobile-android-source/app/src/main/assets/web/assets', bundleName),
]

const genericPathSearch = `function tt(h,t,e,cost){
  class CostHeap{
    items=[];
    get length(){return this.items.length}
    push(item){const items=this.items;let index=items.length;items.push(item);for(;index>0;){const parent=index-1>>1;if(items[parent].cost<=item.cost)break;items[index]=items[parent];index=parent}items[index]=item}
    pop(){const items=this.items,top=items[0],last=items.pop();if(!items.length||!last)return top;let index=0;for(;;){const left=index*2+1;if(left>=items.length)break;const right=left+1,child=right<items.length&&items[right].cost<items[left].cost?right:left;if(items[child].cost>=last.cost)break;items[index]=items[child];index=child}items[index]=last;return top}
  }
  const distances=new Float64Array(h.length).fill(1/0),previousEdges=Array(h.length),previousNodes=new Int32Array(h.length).fill(-1),heap=new CostHeap;
  for(distances[t]=0,heap.push({node:t,cost:0});heap.length;){const current=heap.pop();if(current.cost!==distances[current.node])continue;if(current.node===e)break;for(const edge of h[current.node]){const edgeCost=cost(edge);const next=current.cost+edgeCost;if(next>=distances[edge.to])continue;distances[edge.to]=next;previousEdges[edge.to]=edge;previousNodes[edge.to]=current.node;heap.push({node:edge.to,cost:next})}}
  if(!Number.isFinite(distances[e]))return null;
  const path=[];for(let node=e;node!==t;node=previousNodes[node]){const edge=previousEdges[node];if(!edge)return null;path.push(edge)}return path.reverse()
}`

const vehicleRouter = `class et{
  constructor(mode,network){
    this.mode=mode;
    const endpoints=new Set;
    if(mode==="vehicle")for(const feature of network.features){if(!O(feature.properties?.Object,"Road")||feature.geometry?.type!=="LineString")continue;const coordinates=feature.geometry.coordinates;if(coordinates.length<2)continue;endpoints.add(this.pointKey(coordinates[0]));endpoints.add(this.pointKey(coordinates.at(-1)))}
    for(const[featureId,feature]of network.features.entries()){
      const properties=feature.properties??{},isRoad=O(properties.Object,"Road");
      if(mode==="vehicle"?!isRoad:!(O(properties.Object,"Pathway")||isRoad&&properties.Category!=="Highway"))continue;
      const direction=properties.Direction;
      if(direction!=="Both"&&direction!=="Forward"&&direction!=="Backward"){this.excluded.direction++;continue}
      const coordinates=feature.geometry?.coordinates;
      if(feature.geometry?.type!=="LineString"||!Array.isArray(coordinates)||coordinates.length<2){this.excluded.geometry++;continue}
      const limit=properties.Limit;
      if(mode==="vehicle"&&(typeof limit!=="number"||!Number.isFinite(limit)||limit<=0)){this.excluded.speed++;continue}
      const speed=mode==="vehicle"?limit/3.6*v.vehicleSpeedFactor:v.walkingMetersPerSecond;
      const closed=mode==="vehicle"&&coordinates.length>=4&&this.pointKey(coordinates[0])===this.pointKey(coordinates.at(-1));
      const nodes=coordinates.map((point,index)=>this.node(point,index===0||index===coordinates.length-1||closed&&endpoints.has(this.pointKey(point))));
      const volume=typeof properties.Volume==="number"&&Number.isFinite(properties.Volume)?properties.Volume:0;
      for(let index=1;index<coordinates.length;index++){
        const start=coordinates[index-1],end=coordinates[index],distance=j(start,end);
        if(!(distance>0)){this.excluded.length++;continue}
        const segment={from:nodes[index-1],to:nodes[index],start,end,distance,seconds:distance/speed,featureId,direction:mode==="walk"?"Both":direction,volume};
        this.segments.push(segment);
        if(segment.direction!=="Backward")this.edge(this.adjacency,segment.from,segment.to,segment.start,segment.end,segment.distance,segment.seconds,featureId,undefined,volume);
        if(segment.direction!=="Forward")this.edge(this.adjacency,segment.to,segment.from,segment.end,segment.start,segment.distance,segment.seconds,featureId,undefined,volume);
      }
    }
  }
  mode;adjacency=[];segments=[];excluded={geometry:0,direction:0,speed:0,length:0};endpointNodes=new Map;
  pointKey(point){return point[0]+","+point[1]}
  node(point,endpoint){const key=this.pointKey(point);if(endpoint){const existing=this.endpointNodes.get(key);if(existing!==undefined)return existing}const node=this.adjacency.length;this.adjacency.push([]);if(endpoint)this.endpointNodes.set(key,node);return node}
  edge(adjacency,from,to,start,end,distance,seconds,featureId,kind=this.mode,volume=0){adjacency[from].push({to,distance,seconds,coordinates:[start,end],featureId,kind,volume})}
  nearest(point,maxDistance){let nearest=null;for(const segment of this.segments){const projection=H(point,segment.start,segment.end);if(projection.distance>maxDistance||nearest&&projection.distance>=nearest.distance)continue;nearest={segment,...projection}}return nearest}
  route(origin,destination){
    const maxDistance=this.mode==="vehicle"?v.vehicleAccessMeters:v.walkingAccessMeters;
    const accessPoints=input=>{const cache=new Map,nearest=point=>{const key=this.pointKey(point);if(!cache.has(key))cache.set(key,this.nearest(point,maxDistance));return cache.get(key)};return D(input,point=>nearest(point)?.distance??null,maxDistance).flatMap(point=>{const snap=nearest(point);return snap?[{point,snap}]:[]})};
    const origins=accessPoints(origin),destinations=accessPoints(destination);
    if(!origins.length||!destinations.length)return{reason:"access"};
    const adjacency=this.adjacency.map(edges=>edges.slice()),source=adjacency.length,sink=source+1;
    adjacency.push([],[]);
    const walkingSpeed=v.walkingMetersPerSecond;
    const addEdge=(from,to,start,end,distance,seconds,featureId,kind,volume=0)=>this.edge(adjacency,from,to,start,end,distance,seconds,featureId,kind,volume);
    const attach=(projection,node,outgoing)=>{
      const segment=projection.segment,before=segment.distance*projection.fraction,after=segment.distance-before;
      if(segment.direction!=="Backward")(outgoing?addEdge(node,segment.to,projection.point,segment.end,after,segment.seconds*(1-projection.fraction),segment.featureId,this.mode,segment.volume):addEdge(segment.from,node,segment.start,projection.point,before,segment.seconds*projection.fraction,segment.featureId,this.mode,segment.volume));
      if(segment.direction!=="Forward")(outgoing?addEdge(node,segment.from,projection.point,segment.start,before,segment.seconds*projection.fraction,segment.featureId,this.mode,segment.volume):addEdge(segment.to,node,segment.end,projection.point,after,segment.seconds*(1-projection.fraction),segment.featureId,this.mode,segment.volume));
    };
    const originNodes=origins.map(({point,snap})=>{const node=adjacency.length;adjacency.push([]);addEdge(source,node,point,snap.point,snap.distance,snap.distance/walkingSpeed,null,"access",0);attach(snap,node,true);return node});
    const destinationNodes=destinations.map(({point,snap})=>{const node=adjacency.length;adjacency.push([]);attach(snap,node,false);addEdge(node,sink,snap.point,point,snap.distance,snap.distance/walkingSpeed,null,"access",0);return node});
    for(const[originIndex,{snap:originSnap}]of origins.entries())for(const[destinationIndex,{snap:destinationSnap}]of destinations.entries()){
      if(originSnap.segment!==destinationSnap.segment)continue;
      const segment=originSnap.segment,fraction=destinationSnap.fraction-originSnap.fraction;
      if(fraction>=0&&segment.direction!=="Backward"||fraction<=0&&segment.direction!=="Forward")addEdge(originNodes[originIndex],destinationNodes[destinationIndex],originSnap.point,destinationSnap.point,Math.abs(fraction)*segment.distance,Math.abs(fraction)*segment.seconds,segment.featureId,this.mode,segment.volume);
    }
    const strategies=[
      {strategy:"fastest",cost:edge=>edge.seconds},
      {strategy:"shortest",cost:edge=>edge.distance},
      {strategy:"avoid-traffic",cost:edge=>edge.seconds*(1+Math.min(2.5,Math.max(0,edge.volume||0)/400))},
    ];
    const routes=[];
    for(const strategy of strategies){
      const path=tt(adjacency,source,sink,strategy.cost);
      if(!path)continue;
      routes.push({
        strategy:strategy.strategy,
        distance:path.reduce((total,edge)=>total+edge.distance,0),
        seconds:path.reduce((total,edge)=>total+edge.seconds,0),
        accessDistance:path.filter(edge=>edge.kind==="access").reduce((total,edge)=>total+edge.distance,0),
        coordinates:path.map(edge=>edge.coordinates),
        featureIds:[...new Set(path.flatMap(edge=>edge.featureId===null?[]:[edge.featureId]))],
      });
    }
    if(!routes.length)return{reason:"disconnected"};
    return{routes,route:routes[0]};
  }
}`

const transitRouter = `class TransitCostHeap{
  items=[];
  get length(){return this.items.length}
  push(item){const items=this.items;let index=items.length;items.push(item);for(;index>0;){const parent=index-1>>1;if(items[parent].cost<=item.cost)break;items[index]=items[parent];index=parent}items[index]=item}
  pop(){const items=this.items,top=items[0],last=items.pop();if(!items.length||!last)return top;let index=0;for(;;){const left=index*2+1;if(left>=items.length)break;const right=left+1,child=right<items.length&&items[right].cost<items[left].cost?right:left;if(items[child].cost>=last.cost)break;items[index]=items[child];index=child}items[index]=last;return top}
}
class yt{
  data;walking;rides;transferPaths=new Map;
  constructor(network,pois,routes){this.data=at(pois,routes);const activeStops=[...new Set(this.data.occurrences.map(occurrence=>occurrence.stopId))];this.walking=new ft(network,this.data.stops,activeStops);this.rides=this.data.occurrences.map(()=>[]);const dwellByMode={bus:25,train:120,tram:30,subway:60,ship:120,ferry:120};for(const route of this.data.routes){const speed=pt[route.mode]/3.6,dwellSeconds=dwellByMode[route.mode]??30;for(let index=1;index<route.occurrences.length;index++){const from=this.data.occurrences[route.occurrences[index-1]],to=this.data.occurrences[route.occurrences[index]],distance=to.position.progress-from.position.progress;if(distance<.1)continue;const coordinates=dt(this.data,from,to),seconds=distance/speed+dwellSeconds;this.rides[from.id].push({to:to.id,distance,seconds,dwellSeconds,coordinates});this.rides[to.id].push({to:from.id,distance,seconds,dwellSeconds,coordinates:coordinates.slice().reverse()})}}}
  transfers(stopId){let result=this.transferPaths.get(stopId);return result||(result=this.walking.fromStop(stopId,Infinity),this.transferPaths.set(stopId,result),result)}
  objective(strategy,state){return strategy==="least-walking"?state.walkingDistance*1e6+state.seconds:state.transfers*1e12+state.seconds*1000+state.walkingDistance}
  routeOne(origin,destination,strategy){
    if(!this.data.occurrences.length)return{reason:"no-service"};
    const access=input=>{const best=new Map,points=D(input,point=>this.walking.index.nearest(point,v.walkingSnapMeters)?.distance??null,v.walkingSnapMeters);for(const point of points)for(const[stopId,walk]of this.walking.fromPlace(point,v.walkingAccessMeters))if(walk.seconds<(best.get(stopId)?.seconds??1/0))best.set(stopId,walk);return best};
    const origins=access(origin),destinations=access(destination);
    if(!origins.size||!destinations.size)return{reason:"access"};
    const count=this.data.occurrences.length,stateCount=count*count*2,key=(occurrence,layer,boarded)=>((layer-1)*count+occurrence)*2+Number(boarded);
    const costs=new Float64Array(stateCount).fill(1/0),states=Array(stateCount),heap=new TransitCostHeap;
    const update=(stateKey,cost,state)=>{if(cost>=costs[stateKey])return;costs[stateKey]=cost;states[stateKey]=state;heap.push({key:stateKey,cost})};
    for(const[stopId,walk]of origins)for(const occurrence of this.data.occurrencesByStop[stopId]){const state={previous:null,legs:walk.distance>.1?[$(walk)]:[],seconds:walk.seconds,walkingDistance:walk.distance,transfers:0};update(key(occurrence,1,false),this.objective(strategy,state),state)}
    let bestKey=-1,bestCost=1/0,bestAccess=null;
    while(heap.length){
      const current=heap.pop();
      if(current.cost!==costs[current.key]||current.cost>=bestCost)continue;
      const layer=Math.floor(current.key/(count*2))+1,occurrence=Math.floor(current.key/2)%count,boarded=current.key%2===1;
      const entry=states[current.key],occ=this.data.occurrences[occurrence],route=this.data.routes[occ.routeId],stop=this.data.stops[occ.stopId],destinationWalk=destinations.get(occ.stopId);
      if(boarded&&destinationWalk){
        const state={seconds:entry.seconds+destinationWalk.seconds,walkingDistance:entry.walkingDistance+destinationWalk.distance,transfers:layer-1};
        const finalCost=this.objective(strategy,state);
        if(finalCost<bestCost){bestCost=finalCost;bestKey=current.key;bestAccess=destinationWalk}
      }
      for(const ride of this.rides[occurrence]){
        const next=this.data.occurrences[ride.to],nextState={previous:current.key,legs:[{kind:"ride",distance:ride.distance,seconds:ride.seconds,dwellSeconds:ride.dwellSeconds,coordinates:ride.coordinates,routeId:route.id,routeName:route.name,mode:route.mode,color:route.color,fromStop:stop.name,toStop:this.data.stops[next.stopId].name}],seconds:entry.seconds+ride.seconds,walkingDistance:entry.walkingDistance,transfers:layer-1};
        update(key(ride.to,layer,true),this.objective(strategy,nextState),nextState)
      }
      if(layer<count&&boarded)for(const[transferStop,distance]of this.transfers(occ.stopId))for(const nextOccurrence of this.data.occurrencesByStop[transferStop]){
        if(this.data.occurrences[nextOccurrence].routeId===occ.routeId)continue;
        const transferPoint=this.data.stops[transferStop],nextState={previous:current.key,legs:distance.distance>.1?[$(distance)]:[],seconds:entry.seconds+distance.seconds,walkingDistance:entry.walkingDistance+distance.distance,transfers:layer};
        update(key(nextOccurrence,layer+1,false),this.objective(strategy,nextState),nextState)
      }
    }
    if(bestKey<0||!bestAccess)return{reason:"disconnected"};
    const legs=[];for(let cursor=bestKey;states[cursor]!==undefined;){const state=states[cursor];legs.push(state.legs);if(state.previous===null)break;cursor=state.previous}
    const merged=mt([...legs.reverse().flat(),...bestAccess.distance>.1?[$(bestAccess,bestAccess.coordinates.slice().reverse())]:[]]);
    return{journey:{strategy,legs:merged,distance:merged.reduce((total,leg)=>total+leg.distance,0),seconds:merged.reduce((total,leg)=>total+leg.seconds,0),walkingDistance:merged.filter(leg=>leg.kind==="walk").reduce((total,leg)=>total+leg.distance,0),transfers:states[bestKey].transfers,assumptions:["stops inferred from route geometry","bidirectional service","mode-specific stop dwell time","no fixed wait or transfer penalty","no transfer walking distance limit"]}};
  }
  route(origin,destination){
    const journeys=[this.routeOne(origin,destination,"least-walking"),this.routeOne(origin,destination,"fewest-transfers")].filter(result=>result.journey).map(result=>result.journey);
    if(!journeys.length)return this.routeOne(origin,destination,"least-walking");
    return{journeys,journey:journeys[0]};
  }
}`

const subwayTransitRouter = `const SUBWAY_STATION_WALK_SECONDS=180;
class TransitCostHeap{
  items=[];
  get length(){return this.items.length}
  push(item){const items=this.items;let index=items.length;items.push(item);for(;index>0;){const parent=index-1>>1;if(items[parent].cost<=item.cost)break;items[index]=items[parent];index=parent}items[index]=item}
  pop(){const items=this.items,top=items[0],last=items.pop();if(!items.length||!last)return top;let index=0;for(;;){const left=index*2+1;if(left>=items.length)break;const right=left+1,child=right<items.length&&items[right].cost<items[left].cost?right:left;if(items[child].cost>=last.cost)break;items[index]=items[child];index=child}items[index]=last;return top}
}
class yt{
  data;walking;rides;transferPaths=new Map;entrances=[];coveredSubwayStops=new Set;stationPlatforms=new Map;
  constructor(network,pois,routes,entranceTable){
    this.data=at(pois,routes);
    const stopCount=this.data.stops.length,stopBySource=new Map(this.data.stops.map(stop=>[stop.sourceId,stop]));
    for(const station of entranceTable?.stations??[]){
      const platformStopIds=[...new Set((station.platformStopFeatureIds??[]).map(sourceId=>stopBySource.get(sourceId)?.id).filter(id=>id!==undefined))];
      for(const stopId of platformStopIds)this.stationPlatforms.set(stopId,platformStopIds);
      const stationEntrances=[];
      for(const entrance of station.entrances??[]){
        if(!Array.isArray(entrance.coordinates)||entrance.coordinates.length<2||!platformStopIds.length)continue;
        stationEntrances.push({id:stopCount+this.entrances.length+stationEntrances.length,name:entrance.name||station.name,coordinates:entrance.coordinates,platformStopIds,stationId:station.id,stationName:station.name});
      }
      if(!stationEntrances.length)continue;
      for(const stopId of platformStopIds)this.coveredSubwayStops.add(stopId);
      this.entrances.push(...stationEntrances);
    }
    const activeStops=new Set(this.data.occurrences.map(occurrence=>occurrence.stopId));
    for(const entrance of this.entrances)activeStops.add(entrance.id);
    const walkingStops=this.data.stops.concat(this.entrances.map(entrance=>({id:entrance.id,name:entrance.name,point:entrance.coordinates})));
    this.walking=new ft(network,walkingStops,[...activeStops]);
    this.rides=this.data.occurrences.map(()=>[]);
    const dwellByMode={bus:25,train:120,tram:30,subway:60,ship:120,ferry:120};
    for(const route of this.data.routes){
      const speed=pt[route.mode]/3.6,dwellSeconds=dwellByMode[route.mode]??30;
      for(let index=1;index<route.occurrences.length;index++){
        const from=this.data.occurrences[route.occurrences[index-1]],to=this.data.occurrences[route.occurrences[index]],distance=to.position.progress-from.position.progress;
        if(distance<.1)continue;
        const coordinates=dt(this.data,from,to),seconds=distance/speed+dwellSeconds;
        this.rides[from.id].push({to:to.id,distance,seconds,dwellSeconds,coordinates});
        this.rides[to.id].push({to:from.id,distance,seconds,dwellSeconds,coordinates:coordinates.slice().reverse()});
      }
    }
  }
  transfers(stopId){
    let result=this.transferPaths.get(stopId);
    if(!result){
      result=this.walking.fromStop(stopId,Infinity);
      for(const key of result.keys())if(key>=this.data.stops.length)result.delete(key);
      const from=this.data.stops[stopId];
      for(const toStopId of this.stationPlatforms.get(stopId)??[]){
        if(toStopId===stopId)continue;
        const to=this.data.stops[toStopId],meters=j(from.point,to.point),existing=result.get(toStopId);
        if(existing&&existing.distance<=meters*1.25)continue;
        result.set(toStopId,{distance:meters,seconds:meters/v.walkingMetersPerSecond,coordinates:[from.point,to.point],stationTransfer:true});
      }
      this.transferPaths.set(stopId,result);
    }
    return result;
  }
  objective(strategy,state){return strategy==="least-walking"?state.walkingDistance*1e6+state.seconds:strategy==="fewest-transfers"?state.transfers*1e12+state.seconds*1000+state.walkingDistance:state.seconds*1000+state.transfers}
  accessScore(strategy,access){return strategy==="least-walking"?access.distance*1e6+access.seconds:access.seconds*1000}
  stationWalk(fromPoint,toPoint,entrance){
    return{kind:"station",distance:0,seconds:SUBWAY_STATION_WALK_SECONDS,coordinates:[fromPoint,toPoint],stationName:entrance.stationName,entranceId:entrance.id,entranceName:entrance.name};
  }
  access(input,strategy){
    const best=new Map,stopCount=this.data.stops.length,walks=this.walking.fromPlace(input,v.walkingAccessMeters);
    const add=(stopId,access)=>{const existing=best.get(stopId);if(!existing||this.accessScore(strategy,access)<this.accessScore(strategy,existing))best.set(stopId,access)};
    for(const[key,walk]of walks){
      if(key<stopCount){
        const stop=this.data.stops[key];
        if(stop.mode==="subway"&&this.coveredSubwayStops.has(key))continue;
        add(key,{distance:walk.distance,seconds:walk.seconds,coordinates:walk.coordinates,entrance:null});
        continue;
      }
      const entrance=this.entrances[key-stopCount];
      if(!entrance)continue;
      for(const stopId of entrance.platformStopIds){
        add(stopId,{distance:walk.distance,seconds:walk.seconds+SUBWAY_STATION_WALK_SECONDS,coordinates:walk.coordinates,entrance,stationWalkSeconds:SUBWAY_STATION_WALK_SECONDS});
      }
    }
    return best;
  }
  routeOne(origin,destination,strategy){
    if(!this.data.occurrences.length)return{reason:"no-service"};
    const origins=this.access(origin,strategy),destinations=this.access(destination,strategy),
      estimatedAccess=[...origins.values(),...destinations.values()].some(access=>access.estimated===true);
    if(!origins.size||!destinations.size)return{reason:"access",debug:{origin:origins.debug,destination:destinations.debug}};
    const count=this.data.occurrences.length,stateCount=count*count*2,key=(occurrence,layer,boarded)=>((layer-1)*count+occurrence)*2+Number(boarded);
    const costs=new Float64Array(stateCount).fill(1/0),states=Array(stateCount),heap=new TransitCostHeap;
    const update=(stateKey,cost,state)=>{if(cost>=costs[stateKey])return;costs[stateKey]=cost;states[stateKey]=state;heap.push({key:stateKey,cost})};
    for(const[stopId,walk]of origins)for(const occurrence of this.data.occurrencesByStop[stopId]){
      const legs=[];
      if(walk.distance>.1)legs.push($(walk));
      if(walk.entrance)legs.push(this.stationWalk(walk.entrance.coordinates,this.data.stops[stopId].point,walk.entrance));
      const state={previous:null,legs,seconds:walk.seconds,walkingDistance:walk.distance,transfers:0};
      update(key(occurrence,1,false),this.objective(strategy,state),state);
    }
    let bestKey=-1,bestCost=1/0,bestEgress=null;
    while(heap.length){
      const current=heap.pop();
      if(current.cost!==costs[current.key]||current.cost>=bestCost)continue;
      const layer=Math.floor(current.key/(count*2))+1,occurrence=Math.floor(current.key/2)%count,boarded=current.key%2===1;
      const entry=states[current.key],occ=this.data.occurrences[occurrence],route=this.data.routes[occ.routeId],stop=this.data.stops[occ.stopId],destinationWalk=destinations.get(occ.stopId);
      if(boarded&&destinationWalk){
        const state={seconds:entry.seconds+destinationWalk.seconds,walkingDistance:entry.walkingDistance+destinationWalk.distance,transfers:layer-1};
        const finalCost=this.objective(strategy,state);
        if(finalCost<bestCost){
          const egress=[];
          if(destinationWalk.entrance)egress.push(this.stationWalk(stop.point,destinationWalk.entrance.coordinates,destinationWalk.entrance));
          if(destinationWalk.distance>.1)egress.push($(destinationWalk,destinationWalk.coordinates.slice().reverse()));
          bestCost=finalCost;
          bestKey=current.key;
          bestEgress={legs:egress,seconds:destinationWalk.seconds,walkingDistance:destinationWalk.distance};
        }
      }
      for(const ride of this.rides[occurrence]){
        const next=this.data.occurrences[ride.to],nextState={previous:current.key,legs:[{kind:"ride",distance:ride.distance,seconds:ride.seconds,dwellSeconds:ride.dwellSeconds,coordinates:ride.coordinates,routeId:route.id,routeName:route.name,mode:route.mode,color:route.color,fromStop:stop.name,toStop:this.data.stops[next.stopId].name}],seconds:entry.seconds+ride.seconds,walkingDistance:entry.walkingDistance,transfers:layer-1};
        update(key(ride.to,layer,true),this.objective(strategy,nextState),nextState);
      }
      if(layer<count&&boarded)for(const[transferStop,distance]of this.transfers(occ.stopId))for(const nextOccurrence of this.data.occurrencesByStop[transferStop]){
        if(this.data.occurrences[nextOccurrence].routeId===occ.routeId)continue;
        const nextState={previous:current.key,legs:distance.distance>.1?[$(distance)]:[],seconds:entry.seconds+distance.seconds,walkingDistance:entry.walkingDistance+distance.distance,transfers:layer};
        update(key(nextOccurrence,layer+1,false),this.objective(strategy,nextState),nextState);
      }
    }
    if(bestKey<0||!bestEgress)return{reason:"disconnected",debug:{origin:origins.debug,destination:destinations.debug}};
    const legs=[];for(let cursor=bestKey;states[cursor]!==undefined;){const state=states[cursor];legs.push(state.legs);if(state.previous===null)break;cursor=state.previous}
    const merged=mt([...legs.reverse().flat(),...bestEgress.legs]);
    return{journey:{strategy,legs:merged,distance:merged.reduce((total,leg)=>total+leg.distance,0),seconds:merged.reduce((total,leg)=>total+leg.seconds,0),walkingDistance:merged.filter(leg=>leg.kind==="walk").reduce((total,leg)=>total+leg.distance,0),transfers:states[bestKey].transfers,estimatedAccess,accessDebug:{origin:origins.debug,destination:destinations.debug},assumptions:["stops inferred from route geometry","bidirectional service","mode-specific stop dwell time","subway access chooses the fastest entrance plus 3-minute station walk","missing pedestrian links use a 1.25x straight-line estimate","no fixed wait or transfer penalty","no transfer walking distance limit"]}};
  }
  route(origin,destination){
    const journeys=[this.routeOne(origin,destination,"shortest-time"),this.routeOne(origin,destination,"least-walking"),this.routeOne(origin,destination,"fewest-transfers")].filter(result=>result.journey).map(result=>result.journey);
    if(!journeys.length)return this.routeOne(origin,destination,"shortest-time");
    return{journeys,journey:journeys[0]};
  }
}`

const subwayEntranceAccess = `  access(input,strategy){
    const best=new Map,subwayFallback=new Map,stopCount=this.data.stops.length,
      accessSamples=D(input,point=>this.walking.index.nearest(point,v.walkingAccessMeters)?.distance??null,v.walkingAccessMeters),
      walkCandidates=accessSamples.map(point=>({point,...this.walking.walkDiagnostics(point,v.walkingAccessMeters)})).filter(candidate=>candidate.distance!==null),
      nearestWalk=walkCandidates.reduce((nearest,candidate)=>!nearest||candidate.distance<nearest.distance?candidate:nearest,null),
      graphPoints=walkCandidates.filter(candidate=>candidate.distance<=v.walkingSnapMeters).map(candidate=>candidate.point),
      walks=new Map;
    for(const point of graphPoints)for(const[key,walk]of this.walking.fromPlace(point,v.walkingAccessMeters)){
      const existing=walks.get(key);
      if(!existing||walk.seconds<existing.seconds)walks.set(key,walk);
    }
    let graphStops=0,entranceWalks=0,directStops=0,directEntrances=0,directPlatforms=0;
    const add=(map,stopId,access)=>{const existing=map.get(stopId);if(!existing||this.accessScore(strategy,access)<this.accessScore(strategy,existing))map.set(stopId,access)};
    for(const[key,walk]of walks){
      if(key<stopCount){
        const stop=this.data.stops[key],access={distance:walk.distance,seconds:walk.seconds,coordinates:walk.coordinates,entrance:null,estimated:false};
        if(stop.mode==="subway"&&this.coveredSubwayStops.has(key))add(subwayFallback,key,access);
        else{add(best,key,access);graphStops++;}
        continue;
      }
      const entrance=this.entrances[key-stopCount];
      if(!entrance)continue;
      entranceWalks++;
      for(const stopId of entrance.platformStopIds)add(best,stopId,{distance:walk.distance,seconds:walk.seconds+SUBWAY_STATION_WALK_SECONDS,coordinates:walk.coordinates,entrance,stationWalkSeconds:SUBWAY_STATION_WALK_SECONDS,estimated:false});
    }
    let directSamples=null;
    const directAccess=point=>{
      if(!directSamples)directSamples=D(input,()=>0,v.walkingAccessMeters,512);
      let nearest=null;
      for(const sample of directSamples){const distance=j(sample,point);if(distance>v.walkingAccessMeters||nearest&&distance>=nearest.distance)continue;nearest={point:sample,distance}};
      if(!nearest)return null;
      const estimatedDistance=nearest.distance*1.25;
      return{distance:estimatedDistance,seconds:estimatedDistance/v.walkingMetersPerSecond,coordinates:[nearest.point,point],entrance:null,estimated:true};
    };
    if(!best.size||entranceWalks===0){
      for(const entrance of this.entrances){
        if(entrance.platformStopIds.some(stopId=>best.get(stopId)?.entrance===entrance))continue;
        const access=directAccess(entrance.coordinates);
        if(!access)continue;
        directEntrances++;
        for(const stopId of entrance.platformStopIds)add(best,stopId,{...access,seconds:access.seconds+SUBWAY_STATION_WALK_SECONDS,entrance,stationWalkSeconds:SUBWAY_STATION_WALK_SECONDS});
      }
      if(!best.size)for(const[key,access]of subwayFallback){
        const estimated=directAccess(this.data.stops[key].point);
        if(estimated){add(best,key,estimated);directPlatforms++;}
      }
      for(const stop of this.data.stops){
        if(stop.mode==="subway"&&this.coveredSubwayStops.has(stop.id)||!this.data.occurrencesByStop[stop.id]?.length)continue;
        if(best.has(stop.id))continue;
        const access=directAccess(stop.point);
        if(access){add(best,stop.id,access);directStops++;}
      }
    }
    best.debug={inputType:input?.type??typeof input,walkSamplePoints:accessSamples.length,walkSnapPoints:graphPoints.length,nearestWalkMeters:nearestWalk?.distance??null,nearestWalkFeatureId:nearestWalk?.featureId??null,nearestWalkComponent:nearestWalk?.component??null,nearestWalkComponentNodes:nearestWalk?.componentNodes??0,graphWalks:walks.size,graphStops,entranceWalks,directEntrances,directStops,directPlatforms,subwayFallbackStops:subwayFallback.size,accessStops:best.size,entrancesAvailable:this.entrances.length,coveredSubwayStops:this.coveredSubwayStops.size,candidateStops:stopCount,estimatedAccess:[...best.values()].some(access=>access.estimated===true)};
    return best;
  }
`

const subwayTransferPaths = `  transfers(stopId){
    let result=this.transferPaths.get(stopId);
    if(!result){
      result=this.walking.fromStop(stopId,Infinity);
      for(const key of result.keys())if(key>=this.data.stops.length)result.delete(key);
      const from=this.data.stops[stopId];
      for(const toStopId of this.stationPlatforms.get(stopId)??[]){
        if(toStopId===stopId)continue;
        const to=this.data.stops[toStopId],meters=j(from.point,to.point),existing=result.get(toStopId);
        if(existing&&existing.distance<=meters*1.25)continue;
        result.set(toStopId,{distance:meters,seconds:meters/v.walkingMetersPerSecond,coordinates:[from.point,to.point],stationTransfer:true});
      }
      this.transferPaths.set(stopId,result);
    }
    return result;
  }
`

function applyNavigationPenalties(source) {
  if (source.includes('applyTrafficLights(pois)')) return source
  source = replaceExact(
    source,
    'mode;adjacency=[];segments=[];excluded={geometry:0,direction:0,speed:0,length:0};endpointNodes=new Map;',
    'mode;adjacency=[];segments=[];excluded={geometry:0,direction:0,speed:0,length:0};endpointNodes=new Map;signalNodes=new Set();signalPenaltySeconds=20;',
    'traffic signal state',
  )
  source = replaceExact(
    source,
    'nearest(point,maxDistance){let nearest=null;for(const segment of this.segments){const projection=H(point,segment.start,segment.end);if(projection.distance>maxDistance||nearest&&projection.distance>=nearest.distance)continue;nearest={segment,...projection}}return nearest}',
    `nearest(point,maxDistance){let nearest=null;for(const segment of this.segments){const projection=H(point,segment.start,segment.end);if(projection.distance>maxDistance||nearest&&projection.distance>=nearest.distance)continue;nearest={segment,...projection}}return nearest}
  applyTrafficLights(pois){
    this.signalNodes.clear();
    for(const feature of pois?.features??[]){
      if(String(feature.properties?.Category??"").split(",").map(value=>value.trim()).indexOf("TrafficLight")<0||feature.geometry?.type!=="Point")continue;
      const point=feature.geometry.coordinates,snap=this.nearest(point,50);
      if(!snap)continue;
      const node=j(point,snap.segment.start)<=j(point,snap.segment.end)?snap.segment.from:snap.segment.to;
      this.signalNodes.add(node);
    }
  }
  trafficSignalDelay(edge){return edge.kind!=="access"&&this.signalNodes.has(edge.to)?this.signalPenaltySeconds:0}
  trafficVolumeDelay(edge){return edge.kind==="access"?0:edge.seconds*Math.min(1.2,Math.max(0,edge.volume||0)/700)}
  edgeEstimate(edge){return edge.seconds+this.trafficSignalDelay(edge)+this.trafficVolumeDelay(edge)}`,
    'traffic penalty methods',
  )
  source = replaceExact(
    source,
    `const strategies=[
      {strategy:"fastest",cost:edge=>edge.seconds},
      {strategy:"shortest",cost:edge=>edge.distance},
      {strategy:"avoid-traffic",cost:edge=>edge.seconds*(1+Math.min(2.5,Math.max(0,edge.volume||0)/400))},
    ];`,
    `const strategies=[
      {strategy:"fastest",cost:edge=>this.edgeEstimate(edge)},
      {strategy:"shortest",cost:edge=>edge.distance},
      {strategy:"avoid-traffic",cost:edge=>this.edgeEstimate(edge)+this.trafficVolumeDelay(edge)*1.5},
    ];`,
    'penalized vehicle strategies',
  )
  source = replaceExact(
    source,
    `routes.push({
        strategy:strategy.strategy,
        distance:path.reduce((total,edge)=>total+edge.distance,0),
        seconds:path.reduce((total,edge)=>total+edge.seconds,0),
        accessDistance:path.filter(edge=>edge.kind==="access").reduce((total,edge)=>total+edge.distance,0),`,
    `const signalPenalty=path.reduce((total,edge)=>total+this.trafficSignalDelay(edge),0),trafficDelay=path.reduce((total,edge)=>total+this.trafficVolumeDelay(edge),0);
      routes.push({
        strategy:strategy.strategy,
        distance:path.reduce((total,edge)=>total+edge.distance,0),
        seconds:path.reduce((total,edge)=>total+edge.seconds,0)+signalPenalty+trafficDelay,
        signalPenalty,
        trafficDelay,
        accessDistance:path.filter(edge=>edge.kind==="access").reduce((total,edge)=>total+edge.distance,0),`,
    'penalized vehicle totals',
  )
  source = replaceExact(
    source,
    'objective(strategy,state){return strategy==="least-walking"?state.walkingDistance*1e6+state.seconds:state.transfers*1e12+state.seconds*1000+state.walkingDistance}',
    'objective(strategy,state){return strategy==="least-walking"?state.walkingDistance*1e6+state.seconds:strategy==="fewest-transfers"?state.transfers*1e12+state.seconds*1000+state.walkingDistance:state.seconds*1000+state.transfers}',
    'shortest time transit objective',
  )
  source = replaceExact(
    source,
    'const journeys=[this.routeOne(origin,destination,"least-walking"),this.routeOne(origin,destination,"fewest-transfers")].filter(result=>result.journey).map(result=>result.journey);',
    'const journeys=[this.routeOne(origin,destination,"least-walking"),this.routeOne(origin,destination,"fewest-transfers"),this.routeOne(origin,destination,"shortest-time")].filter(result=>result.journey).map(result=>result.journey);',
    'shortest time transit journey',
  )
  source = replaceExact(
    source,
    'R=new yt(q,t.pois,t.routes),self.postMessage',
    'R=new yt(q,t.pois,t.routes),B.applyTrafficLights(t.pois),self.postMessage',
    'apply traffic lights',
  )
  return source
}

function applyWalkingGraphDiagnostics(source) {
  if (source.includes('walkDiagnostics(point,maxDistance)')) return source
  source = replaceExact(
    source,
    'class ft{adjacency=[];stopNodes;index=new V;lines=new Map;events=new Map;endpointNodes=new Map;stopAtNode=new Map;activeStops=new Set;constructor',
    'class ft{adjacency=[];stopNodes;index=new V;lines=new Map;events=new Map;endpointNodes=new Map;stopAtNode=new Map;activeStops=new Set;componentIds=new Int32Array(0);componentSizes=[];featureComponents=new Map;constructor',
    'walking component fields',
  )
  source = replaceExact(
    source,
    'this.connect(l.node,d.node,w,f)}}}walkable(t){',
    `this.connect(l.node,d.node,w,f)}}
    this.componentIds=new Int32Array(this.adjacency.length).fill(-1);
    this.componentSizes=[];
    for(let start=0;start<this.adjacency.length;start++){
      if(this.componentIds[start]>=0)continue;
      const componentId=this.componentSizes.length,queue=[start];
      this.componentIds[start]=componentId;
      for(let cursor=0;cursor<queue.length;cursor++)for(const edge of this.adjacency[queue[cursor]]){
        if(this.componentIds[edge.to]>=0)continue;
        this.componentIds[edge.to]=componentId;
        queue.push(edge.to);
      }
      this.componentSizes.push(queue.length);
    }
    this.featureComponents=new Map;
    for(const[featureId,events]of this.events)if(events.length)this.featureComponents.set(featureId,this.componentIds[events[0].node]);
  }
  walkDiagnostics(point,maxDistance){
    const nearest=this.index.nearest(point,maxDistance);
    if(!nearest)return{distance:null,featureId:null,component:null,componentNodes:0};
    const component=this.featureComponents.get(nearest.featureId);
    return{distance:Math.round(nearest.distance*10)/10,featureId:nearest.featureId,component:component??null,componentNodes:component==null?0:this.componentSizes[component]??0};
  }
  walkable(t){`,
    'walking component analysis',
  )
  return source
}

function replaceRange(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start+startMarker.length)
  if(start<0||end<0)throw new Error(label+': target range not found')
  return source.slice(0,start)+replacement+source.slice(end)
}

function replaceExact(source,from,to,label){
  const first=source.indexOf(from)
  if(first<0)throw new Error(label+': target not found')
  if(source.indexOf(from,first+from.length)>=0)throw new Error(label+': target is ambiguous')
  return source.slice(0,first)+to+source.slice(first+from.length)
}

function dedupeStringPropertyObject(source,startMarker,endMarker,label){
  const start=source.indexOf(startMarker)
  if(start<0)throw new Error(label+': object start not found')
  const contentStart=start+startMarker.length,end=source.indexOf(endMarker,contentStart)
  if(end<0)throw new Error(label+': object end not found')
  const content=source.slice(contentStart,end)
  const properties=/([A-Za-z_$][\w$]*|"(?:\\.|[^"\\])*")\s*:\s*"(?:\\.|[^"\\])*"/g
  const unique=new Map
  for(const match of content.matchAll(properties))unique.set(match[1],match[0])
  const uncovered=content.replace(properties,'').replace(/,/g,'').trim()
  if(uncovered)throw new Error(label+': unsupported non-string property')
  const rebuilt=[...unique.values()].join(',')
  return source.slice(0,contentStart)+rebuilt+source.slice(end)
}

for(const target of existing(workerTargets)){
  let source=await readFile(target,'utf8')
  if(!source.includes('strategy:"avoid-traffic"')){
    const oldPathStart=source.indexOf('function tt('),oldPathEnd=source.indexOf('class et{',oldPathStart)
    if(oldPathStart<0||oldPathEnd<0)throw new Error('vehicle path search not found')
    source=source.slice(0,oldPathStart)+genericPathSearch+source.slice(oldPathEnd)
    source=replaceRange(source,'class et{','const st={',vehicleRouter,'vehicle router')
    source=replaceRange(source,'class yt{','let B=null',transitRouter,'transit router')
  }
  if(!source.includes('fromStop(stopId,Infinity)'))source=replaceExact(source,'fromStop(stopId,300)','fromStop(stopId,Infinity)','remove transfer distance limit')
  if(source.includes('stateCount=count*3*2'))source=source.replace('stateCount=count*3*2','stateCount=count*count*2')
  if(source.includes('layer<3&&boarded'))source=source.replace('layer<3&&boarded','layer<count&&boarded')
  source=source.replace('M=j(l[0],l.at(-1))<=1','M=j(l[0],l.at(-1))<=25')
  source=source.replace('const dwellByMode={bus:25,train:60,tram:20,subway:35,ship:45,ferry:45}','const dwellByMode={bus:25,train:120,tram:30,subway:60,ship:120,ferry:120}')
  source=source.replace('transfer walking limited to 300m','no transfer walking distance limit')
  source=applyNavigationPenalties(source)
  source=applyWalkingGraphDiagnostics(source)
  if(!source.includes('SUBWAY_STATION_WALK_SECONDS')){
    source=replaceRange(source,'class TransitCostHeap{','let B=null',subwayTransitRouter,'subway entrance router')
  }
  const coveredSubwayBeforeEntrances=`      for(const stopId of platformStopIds)this.coveredSubwayStops.add(stopId);
      for(const entrance of station.entrances??[]){
        if(!Array.isArray(entrance.coordinates)||entrance.coordinates.length<2||!platformStopIds.length)continue;
        this.entrances.push({id:stopCount+this.entrances.length,name:entrance.name||station.name,coordinates:entrance.coordinates,platformStopIds,stationId:station.id,stationName:station.name});
      }`
  const coveredSubwayAfterEntrances=`      const stationEntrances=[];
      for(const entrance of station.entrances??[]){
        if(!Array.isArray(entrance.coordinates)||entrance.coordinates.length<2||!platformStopIds.length)continue;
        stationEntrances.push({id:stopCount+this.entrances.length+stationEntrances.length,name:entrance.name||station.name,coordinates:entrance.coordinates,platformStopIds,stationId:station.id,stationName:station.name});
      }
      if(!stationEntrances.length)continue;
      for(const stopId of platformStopIds)this.coveredSubwayStops.add(stopId);
      this.entrances.push(...stationEntrances);`
  if(source.includes(coveredSubwayBeforeEntrances))source=replaceExact(source,coveredSubwayBeforeEntrances,coveredSubwayAfterEntrances,'subway stations without entrances')
  else if(!source.includes(coveredSubwayAfterEntrances))throw new Error('subway station entrance coverage logic not found')
  if(!source.includes('coveredSubwayStops=new Set;stationPlatforms=new Map;'))
    source=replaceExact(
      source,
      'data;walking;rides;transferPaths=new Map;entrances=[];coveredSubwayStops=new Set;',
      'data;walking;rides;transferPaths=new Map;entrances=[];coveredSubwayStops=new Set;stationPlatforms=new Map;',
      'station platform transfer state',
    )
  if(!source.includes('for(const stopId of platformStopIds)this.stationPlatforms.set(stopId,platformStopIds);'))
    source=replaceExact(
      source,
      '      const stationEntrances=[];',
      '      for(const stopId of platformStopIds)this.stationPlatforms.set(stopId,platformStopIds);\n      const stationEntrances=[];',
      'station platform transfer table',
    )
  source=replaceRange(source,'  transfers(stopId){','  objective(strategy,state){',subwayTransferPaths,'station platform transfers')
  source=replaceRange(source,'  access(input,strategy){','  routeOne(origin,destination,strategy){',subwayEntranceAccess,'subway entrance access fallback')
  if(!source.includes('estimatedAccess=[...origins.values(),...destinations.values()].some'))
    source=replaceExact(
      source,
      'const origins=this.access(origin,strategy),destinations=this.access(destination,strategy);',
      'const origins=this.access(origin,strategy),destinations=this.access(destination,strategy),estimatedAccess=[...origins.values(),...destinations.values()].some(access=>access.estimated===true);',
      'estimated transit access state',
    )
  source=source.replace('if(!origins.size||!destinations.size)return{reason:"access"};','if(!origins.size||!destinations.size)return{reason:"access",debug:{origin:origins.debug,destination:destinations.debug}};')
  source=source.replace('if(bestKey<0||!bestEgress)return{reason:"disconnected"};','if(bestKey<0||!bestEgress)return{reason:"disconnected",debug:{origin:origins.debug,destination:destinations.debug}};')
  source=source.replace('transfers:states[bestKey].transfers,assumptions:', 'transfers:states[bestKey].transfers,estimatedAccess,assumptions:')
  source=source.replace('transfers:states[bestKey].transfers,estimatedAccess,assumptions:', 'transfers:states[bestKey].transfers,estimatedAccess,accessDebug:{origin:origins.debug,destination:destinations.debug},assumptions:')
  source=source.replace('let B=null,R=null,q=null,P="";','let B=null,R=null,q=null,P="",SU=null;')
  source=source.replace('let B=null,R=null,q=null,P="",E=null;','let B=null,R=null,q=null,P="",SU=null;')
  source=source.replace('P=t.datasetId,q=t.network,B=new et("vehicle",t.network)','P=t.datasetId,q=t.network,SU=t.subwayEntrances??null,B=new et("vehicle",t.network)')
  source=source.replace('P=t.datasetId,q=t.network,E=t.subwayEntrances??null,B=new et("vehicle",t.network)','P=t.datasetId,q=t.network,SU=t.subwayEntrances??null,B=new et("vehicle",t.network)')
  source=source.replace('R=new yt(q,t.pois,t.routes),B.applyTrafficLights','R=new yt(q,t.pois,t.routes,SU),B.applyTrafficLights')
  source=source.replace('R=new yt(q,t.pois,t.routes,E),B.applyTrafficLights','R=new yt(q,t.pois,t.routes,SU),B.applyTrafficLights')
  source=source.replace(
    'R=new yt(q,t.pois,t.routes,SU),B.applyTrafficLights',
    'try{R=new yt(q,t.pois,t.routes,SU)}catch(error){console.warn("Subway entrance routing disabled:",error instanceof Error?error.message:String(error)),SU=null,R=new yt(q,t.pois,t.routes,null)}B.applyTrafficLights',
  )
  source=source.replace('let B=null,R=null,q=null,P="",SU=null;','let B=null,R=null,RB=null,q=null,P="",SU=null;')
  const fallbackRouterInit='RB=new yt(q,t.pois,t.routes,null);'
  while(source.includes(fallbackRouterInit+fallbackRouterInit))
    source=source.replace(fallbackRouterInit+fallbackRouterInit,fallbackRouterInit)
  if(!source.includes(fallbackRouterInit+'try{try{R='))
    source=source.replace('try{try{R=',fallbackRouterInit+'try{try{R=')
  source=source.replace('SU=null,R=new yt(q,t.pois,t.routes,null)}B.applyTrafficLights','SU=null,R=RB}B.applyTrafficLights')
  source=source.replace(
    'outcome:R.route(t.origin,t.destination)',
    'outcome:(()=>{const primary=R.route(t.origin,t.destination);if(primary?.journey||!RB||RB===R)return primary;const fallback=RB.route(t.origin,t.destination);return fallback?.journey?{...fallback,entranceFallback:true}:primary})()',
  )
  source=source.replace(
    'const journeys=[this.routeOne(origin,destination,"least-walking"),this.routeOne(origin,destination,"fewest-transfers"),this.routeOne(origin,destination,"shortest-time")].filter(result=>result.journey).map(result=>result.journey);',
    'const journeys=[this.routeOne(origin,destination,"shortest-time"),this.routeOne(origin,destination,"least-walking"),this.routeOne(origin,destination,"fewest-transfers")].filter(result=>result.journey).map(result=>result.journey);',
  )
  source=source.replace(
    'if(!journeys.length)return this.routeOne(origin,destination,"least-walking");',
    'if(!journeys.length)return this.routeOne(origin,destination,"shortest-time");',
  )
  source=source.replace('version:6','version:7')
  await writeFile(target,source)
  console.log(path.relative(projectRoot,target)+': navigation routes updated')
}

for(const target of existing(bundleTargets)){
  let source=await readFile(target,'utf8')
  if(!source.includes('vehicleStrategy')){
    source=replaceExact(source,'Be.useState("vehicle")','Be.useState("vehicle:fastest")','initial vehicle strategy')
    source=replaceExact(source,'T("vehicle")','T("vehicle:fastest")','reset vehicle strategy')
    source=replaceExact(source,
      'const d=t&&u==="vehicle"?o?.route??null:null,m=t&&u==="transit"?s?.journey??null:null;',
      'const vehicleStrategy=u.startsWith("vehicle:")?u.slice(8):"fastest",transitStrategy=u.startsWith("transit:")?u.slice(8):"least-walking",d=t&&u.startsWith("vehicle")?(o?.routes?.find(g=>g.strategy===vehicleStrategy)??o?.route??null):null,m=t&&u.startsWith("transit")?(s?.journeys?.find(g=>g.strategy===transitStrategy)??s?.journey??null):null;',
      'selected route strategy')
    source=replaceExact(source,
      'function(f){const d=s?.journey?.legs[f];',
      'function(f){const g=u.startsWith("transit:")?u.slice(8):"least-walking",d=(s?.journeys?.find(v=>v.strategy===g)??s?.journey)?.legs[f];',
      'selected transit leg')
    source=replaceExact(source,
      'const V=t&&i&&t.entry.selection.id===i.entry.selection.id;return J.jsxs("section",{className:"directions"',
      'const V=t&&i&&t.entry.selection.id===i.entry.selection.id,ue=r?.routes??(r?.route?[r.route]:[]),ce=a?.journeys??(a?.journey?[a.journey]:[]),Pe=ue.find(I=>I.strategy===(u.startsWith("vehicle:")?u.slice(8):"fastest"))??ue[0],Ne=ce.find(I=>I.strategy===(u.startsWith("transit:")?u.slice(8):"least-walking"))??ce[0];return J.jsxs("section",{className:"directions"',
      'route option state')
    const cardStart=source.indexOf('r&&J.jsxs("div",{className:`directions-card${u==="vehicle"?" is-selected":""}`')
    const cardEnd=source.indexOf(']})}function u6(',cardStart)
    if(cardStart<0||cardEnd<0)throw new Error('directions cards not found')
    const cards=`r&&J.jsxs("div",{className:\`directions-card\${u.startsWith("vehicle")?" is-selected":""}\`,"aria-live":"polite",children:[J.jsx("h3",{children:S("vehicle")}),ue.length?J.jsxs(J.Fragment,{children:[J.jsx("div",{className:"route-strategy-list",children:ue.map(I=>J.jsxs("button",{type:"button",className:u==="vehicle:"+I.strategy?"is-active":"",onClick:()=>h("vehicle:"+I.strategy),children:[J.jsx("strong",{children:S(I.strategy==="fastest"?"fastest":I.strategy==="shortest"?"shortest":"avoidTraffic")}),J.jsx("small",{children:S("minutes",{count:D(Math.max(1,Math.round(I.seconds/60)))})+" · "+(I.distance/1e3).toFixed(1)+"km"})]},I.strategy))}),Pe&&J.jsxs(J.Fragment,{children:[J.jsxs("p",{children:[S("minutes",{count:D(Math.max(1,Math.round(Pe.seconds/60)))})," · ",(Pe.distance/1e3).toFixed(1),"km"]}),J.jsx("p",{children:S("routeSummary",{count:D(Pe.featureIds.length),distance:D(Math.round(Pe.accessDistance))})})]})]}):J.jsx("p",{children:S(r.reason==="access"?"vehicleAccessFailed":"vehicleDisconnected")}),J.jsx("small",{children:S("vehicleNote")})]}),J.jsxs("div",{className:\`directions-card\${u.startsWith("transit")?" is-selected":""}\`,"aria-live":"polite",children:[J.jsx("h3",{children:S("transit")}),ce.length?J.jsxs(J.Fragment,{children:[J.jsx("div",{className:"route-strategy-list",children:ce.map(I=>J.jsxs("button",{type:"button",className:u==="transit:"+I.strategy?"is-active":"",onClick:()=>h("transit:"+I.strategy),children:[J.jsx("strong",{children:S(I.strategy==="least-walking"?"leastWalking":"fewestTransfers")}),J.jsx("small",{children:S("minutes",{count:D(Math.max(1,Math.round(I.seconds/60)))})+" · "+S("walk",{distance:D(Math.round(I.walkingDistance||0))})+" · "+S("transfers",{count:D(I.transfers)})})]},I.strategy))}),Ne&&J.jsxs(J.Fragment,{children:[J.jsxs("p",{children:[S("minutes",{count:D(Math.max(1,Math.round(Ne.seconds/60)))})," · ",(Ne.distance/1e3).toFixed(1),"km"]}),J.jsx("p",{children:S("transfers",{count:D(Ne.transfers)})}),u.startsWith("transit")&&J.jsx("ol",{className:"directions-legs",children:Ne.legs.map((I,N)=>J.jsx("li",{children:J.jsxs("button",{type:"button",onClick:()=>f(N),children:[I.kind==="ride"?J.jsxs(J.Fragment,{children:[J.jsx("span",{className:"directions-leg-swatch",style:{backgroundColor:I.color}}),J.jsx("strong",{children:N_(I.routeName??"",S)})," ",N_(I.fromStop??"",S)," → ",N_(I.toStop??"",S)]}):J.jsx("strong",{children:S("walk",{distance:D(Math.round(I.distance))})}),J.jsx("small",{children:S("minutes",{count:D(Math.max(1,Math.round(I.seconds/60)))})})]})},N))}),J.jsx("small",{children:[S("assumptionStops"),S("assumptionBidirectional"),S("assumptionDwell")].join(" · ")})]})]}):a?.reason?J.jsx("p",{children:S(a.reason==="no-service"?"transitNoService":a.reason==="access"?"transitAccessFailed":"transitDisconnected")}):J.jsx("p",{children:o==="error"?Qo(s,S):S(o==="calculating"?"transitCalculating":o==="loading"?"transitDataLoading":"selectPlaces")})]})`
    source=source.slice(0,cardStart)+cards+source.slice(cardEnd)
  }
  if(!source.includes('fastest:"最快路线"')){
    source=replaceExact(source,'vehicle:"차량"','vehicle:"차량",fastest:"가장 빠른 경로",shortest:"최단 거리",avoidTraffic:"교통량 회피",leastWalking:"도보 최소",fewestTransfers:"환승 최소",assumptionDwell:"정차 시간 반영"','Korean route labels')
    source=replaceExact(source,'vehicle:"Vehicles"','vehicle:"Vehicles",fastest:"Fastest",shortest:"Shortest",avoidTraffic:"Avoid traffic",leastWalking:"Least walking",fewestTransfers:"Fewest transfers",assumptionDwell:"Stop dwell time included"','English route labels')
    source=replaceExact(source,'"vehicle":"车辆"','"vehicle":"车辆","fastest":"最快路线","shortest":"里程最短","avoidTraffic":"避开高交通量","leastWalking":"少走路","fewestTransfers":"少换乘","assumptionDwell":"已计入到站停靠时间"','Chinese route labels')
  }
  source=source.replace('S("assumptionTransferLimit")','S("assumptionDwell")')
  source=source.replace('S(I.strategy==="least-walking"?"leastWalking":"fewestTransfers")','S(I.strategy==="least-walking"?"leastWalking":I.strategy==="fewest-transfers"?"fewestTransfers":"shortestTime")')
  if(!source.includes('assumptionDwell:"已计入到站停靠时间"')){
    source=source.split('assumptionTransferLimit:"환승 도보 최대 300m"').join('assumptionTransferLimit:"환승 도보 최대 300m",assumptionDwell:"정차 시간 반영"')
    source=source.split('assumptionTransferLimit:"Transfer walking limited to 300m"').join('assumptionTransferLimit:"Transfer walking limited to 300m",assumptionDwell:"Stop dwell time included"')
    source=source.split('"assumptionTransferLimit":"换乘步行最远 300 米"').join('"assumptionTransferLimit":"换乘步行最远 300 米","assumptionDwell":"已计入到站停靠时间"')
  }
  if(!source.includes('shortestTime:"最快公共交通"')){
    source=source.split('fewestTransfers:"환승 최소"').join('fewestTransfers:"환승 최소",shortestTime:"최단 시간"')
    source=source.split('fewestTransfers:"Fewest transfers"').join('fewestTransfers:"Fewest transfers",shortestTime:"Shortest time"')
    source=source.split('"fewestTransfers":"少换乘"').join('"fewestTransfers":"少换乘","shortestTime":"最短时间"')
    source=source.split('vehicleNote:"예상 시간 · 교통상황 미반영 · 도로 속도 제한의 80% 적용"').join('vehicleNote:"예상 시간 · 신호 및 정적 교통량 반영 · 실시간 교통 미반영"')
    source=source.split('vehicleNote:"Estimated time · traffic excluded · 80% of road speed limits"').join('vehicleNote:"Estimated time · signals and static traffic volume included · live traffic excluded"')
    source=source.split('"vehicleNote":"预计时间 · 未计入交通状况 · 按道路限速的 80% 估算"').join('"vehicleNote":"预计时间 · 已计入信号灯和静态交通量 · 未计入实时路况"')
  }
  if(!source.includes('Subway_Station_Entrances.json')){
    source=replaceExact(source,
      'return{configure:r,loadCollection:a,loadExtraInfo:o,loadWaterImage:s,loadNetworkBoundaryLod:c}}',
      'async function l(){try{const u=await i(`${e}/GeoJSON/Subway_Station_Entrances.json`,{cache:"no-store"});if(!u.ok)return null;const h=await u.json();return h&&Array.isArray(h.stations)?h:null}catch{return null}}return{configure:r,loadCollection:a,loadExtraInfo:o,loadWaterImage:s,loadNetworkBoundaryLod:c,loadSubwayEntrances:l}}',
      'subway entrance loader',
    )
    source=replaceExact(source,
      'const[d,m,g]=await Promise.all([s("buildings",()=>t.loadCollection("Building_Boundary.json","Polygon"),()=>{}),s("network",()=>t.loadCollection("Network_Centerline.json","LineString"),()=>{}),t.loadExtraInfo()]);',
      'const[d,m,g,x]=await Promise.all([s("buildings",()=>t.loadCollection("Building_Boundary.json","Polygon"),()=>{}),s("network",()=>t.loadCollection("Network_Centerline.json","LineString"),()=>{}),t.loadExtraInfo(),t.loadSubwayEntrances().catch(()=>null)]);',
      'load subway entrance table',
    )
    source=replaceExact(source,
      '{buildings:d,network:m,extraInfo:g}',
      '{buildings:d,network:m,extraInfo:g,subwayEntrances:x}',
      'return subway entrance table',
    )
    source=replaceExact(source,
      'e.initializeRouting(te.extraInfo.datasetId,te.network)',
      'e.initializeRouting(te.extraInfo.datasetId,te.network,te.subwayEntrances)',
      'pass subway entrance table to routing',
    )
    source=replaceExact(source,
      'function P6(e,t,i,r){',
      'function P6(e,t,subwayEntrances,i,r){',
      'routing worker entrance argument',
    )
    source=replaceExact(source,
      'o.postMessage({type:"init",datasetId:e,configVersion:Np.version,network:t})',
      'o.postMessage({type:"init",datasetId:e,configVersion:Np.version,network:t,subwayEntrances:subwayEntrances??null})',
      'routing worker entrance payload',
    )
    source=replaceExact(source,
      'const B=Be.useCallback((ve,pe)=>{i.current=ve,e.current=P6(ve,pe,L=>{',
      'const B=Be.useCallback((ve,pe,subwayEntrances)=>{i.current=ve,e.current=P6(ve,pe,subwayEntrances,L=>{',
      'routing initializer entrance argument',
    )
  }
  source=source.replace('const Np={version:6}','const Np={version:7}')
  source=dedupeStringPropertyObject(source,'qR={','},ZR={','Korean labels')
  source=dedupeStringPropertyObject(source,'ZR={','},ZH={','English labels')
  source=dedupeStringPropertyObject(source,'ZH={','},HR={','Chinese labels')
  const repeatedTransitLabels=[
    'shortestTime:"최단 시간",stationWalk:"역내 도보",transitEstimatedAccess:"일부 도보 연결이 없어 직선거리로 추정했습니다."',
    'shortestTime:"Shortest time",stationWalk:"Walk inside station",transitEstimatedAccess:"Some pedestrian links are missing; walking is estimated."',
    '"shortestTime":"最短时间","stationWalk":"站内步行","transitEstimatedAccess":"部分步行连接缺失，步行距离按道路系数估算"',
  ]
  for(const labelGroup of repeatedTransitLabels){
    const duplicate=labelGroup+labelGroup
    while(source.includes(duplicate))source=source.split(duplicate).join(labelGroup)
  }
  if(!source.includes('stationWalk:"역내 도보"')&&!source.includes('"stationWalk":"역내 도보"')){
    source=source.split('fewestTransfers:"환승 최소",shortestTime:"최단 시간"').join('fewestTransfers:"환승 최소",shortestTime:"최단 시간",stationWalk:"역내 도보"')
    source=source.split('fewestTransfers:"Fewest transfers",shortestTime:"Shortest time"').join('fewestTransfers:"Fewest transfers",shortestTime:"Shortest time",stationWalk:"Walk inside station"')
    source=source.split('"fewestTransfers":"少换乘","shortestTime":"最短时间"').join('"fewestTransfers":"少换乘","shortestTime":"最短时间","stationWalk":"站内步行"')
  }
  if(!source.includes('transitEstimatedAccess')) {
    source=source.split('stationWalk:"역내 도보"').join('stationWalk:"역내 도보",transitEstimatedAccess:"일부 도보 연결이 없어 직선거리로 추정했습니다."')
    source=source.split('stationWalk:"Walk inside station"').join('stationWalk:"Walk inside station",transitEstimatedAccess:"Some pedestrian links are missing; walking is estimated."')
    source=source.split('"stationWalk":"站内步行"').join('"stationWalk":"站内步行","transitEstimatedAccess":"部分步行连接缺失，步行距离按道路系数估算"')
  }
  source=source.replace(
    ']})}):J.jsx("strong",{children:S("walk",{distance:D(Math.round(I.distance))})})',
    ']})}):I.kind==="station"?J.jsx("strong",{children:S("stationWalk")}):J.jsx("strong",{children:S("walk",{distance:D(Math.round(I.distance))})})',
  )
  const estimatedAccessNotice='Ne.estimatedAccess&&J.jsx("small",{children:S("transitEstimatedAccess")})'
  const duplicateNotice=','+estimatedAccessNotice
  while(source.includes(estimatedAccessNotice+duplicateNotice))
    source=source.replace(estimatedAccessNotice+duplicateNotice,estimatedAccessNotice)
  if(!source.includes(estimatedAccessNotice))
    source=source.replace(
      'J.jsx("small",{children:[S("assumptionStops"),S("assumptionBidirectional"),S("assumptionDwell")].join(" · ")})',
      `J.jsx("small",{children:[S("assumptionStops"),S("assumptionBidirectional"),S("assumptionDwell")].join(" · ")}),${estimatedAccessNotice}`,
    )
  source=source.replace(
    'if(L.type==="ready"){U(!0);return}',
    'if(L.type==="ready"){console.info("[Skylens routing] vehicle worker ready"),U(!0);return}',
  )
  source=source.replace(
    'if(L.type==="transit-ready"){r.current=!0,S("ready"),I();return}',
    'if(L.type==="transit-ready"){console.info("[Skylens routing] transit ready",JSON.stringify({routes:L.routes,stops:L.stops,excluded:L.excluded})),r.current=!0,S("ready"),I();return}',
  )
  source=source.replace(
    'if(L.type==="transit-ready"){console.info("[Skylens routing] transit ready",{routes:L.routes,stops:L.stops,excluded:L.excluded}),r.current=!0,S("ready"),I();return}',
    'if(L.type==="transit-ready"){console.info("[Skylens routing] transit ready",JSON.stringify({routes:L.routes,stops:L.stops,excluded:L.excluded})),r.current=!0,S("ready"),I();return}',
  )
  source=source.replace(
    'if(L.type==="transit-error"){a.current=!0,s.current=null,S("error"),D(L.error??"대중교통 데이터를 준비하지 못했습니다.");return}',
    'if(L.type==="transit-error"){console.error("[Skylens routing] transit initialization failed",L.error),a.current=!0,s.current=null,S("error"),D(L.error??"대중교통 데이터를 준비하지 못했습니다.");return}',
  )
  source=source.replace(
    'L.error!==void 0?(S("error"),D(L.error)):(x(L.outcome),S("ready"));return',
    'L.error!==void 0?(console.error("[Skylens routing] transit route failed",L.error),S("error"),D(L.error)):(console.info("[Skylens routing] transit result",JSON.stringify({reason:L.outcome?.reason,journeys:L.outcome?.journeys?.map(g=>({strategy:g.strategy,seconds:Math.round(g.seconds),walkingMeters:Math.round(g.walkingDistance),transfers:g.transfers,legs:g.legs.map(v=>({kind:v.kind,route:v.routeName,station:v.stationName,entrance:v.entranceName,from:v.fromStop,to:v.toStop}))}))})),x(L.outcome),S("ready"));return',
  )
  source=source.replace(
    '(console.info("[Skylens routing] transit result",L.outcome),x(L.outcome),S("ready"));return',
    '(console.info("[Skylens routing] transit result",JSON.stringify({reason:L.outcome?.reason,journeys:L.outcome?.journeys?.map(g=>({strategy:g.strategy,seconds:Math.round(g.seconds),walkingMeters:Math.round(g.walkingDistance),transfers:g.transfers,legs:g.legs.map(v=>({kind:v.kind,route:v.routeName,station:v.stationName,entrance:v.entranceName,from:v.fromStop,to:v.toStop}))}))})),x(L.outcome),S("ready"));return',
  )
  source=source.replace(
    'C(!1),L.type==="result"?g(L.outcome):P(L.error??"경로 계산 오류")',
    'C(!1),L.type==="result"?(console.info("[Skylens routing] vehicle result",JSON.stringify({reason:L.outcome?.reason,routes:L.outcome?.routes?.map(g=>({strategy:g.strategy,seconds:Math.round(g.seconds),meters:Math.round(g.distance),signalSeconds:Math.round(g.signalPenalty||0),trafficSeconds:Math.round(g.trafficDelay||0)}))})),g(L.outcome)):P(L.error??"경로 계산 오류")',
  )
  source=source.replace(
    'C(!1),L.type==="result"?(console.info("[Skylens routing] vehicle result",L.outcome),g(L.outcome)):P(L.error??"경로 계산 오류")',
    'C(!1),L.type==="result"?(console.info("[Skylens routing] vehicle result",JSON.stringify({reason:L.outcome?.reason,routes:L.outcome?.routes?.map(g=>({strategy:g.strategy,seconds:Math.round(g.seconds),meters:Math.round(g.distance),signalSeconds:Math.round(g.signalPenalty||0),trafficSeconds:Math.round(g.trafficDelay||0)}))})),g(L.outcome)):P(L.error??"경로 계산 오류")',
  )
  source=source.replace(
    'JSON.stringify({reason:L.outcome?.reason,journeys:',
    'JSON.stringify({reason:L.outcome?.reason,debug:L.outcome?.debug,journeys:',
  )
  source=source.replace(
    'transfers:g.transfers,legs:',
    'transfers:g.transfers,estimatedAccess:g.estimatedAccess===true,accessDebug:g.accessDebug,legs:',
  )
  source=source.split('u.startsWith("transit:")?u.slice(8):"least-walking"').join('u.startsWith("transit:")?u.slice(8):"shortest-time"')
  await writeFile(target,source)
  console.log(path.relative(projectRoot,target)+': navigation UI updated')
}
