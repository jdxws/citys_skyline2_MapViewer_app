(function(){"use strict";function J(h){return typeof h=="string"?[...new Set(h.split(",").map(t=>t.trim()).filter(Boolean))]:[]}function O(h,t){return J(h).includes(t)}const v={version:7,vehicleAccessMeters:250,walkingSnapMeters:250,walkingAccessMeters:1e3,walkingMetersPerSecond:4.5/3.6,vehicleSpeedFactor:.8},T=111320;function j(h,t){const e=(h[1]+t[1])/2*Math.PI/180;return Math.hypot((h[0]-t[0])*T*Math.cos(e),(h[1]-t[1])*T)}function H(h,t,e){const n=T*Math.cos(h[1]*Math.PI/180),r=(h[0]-t[0])*n,a=(h[1]-t[1])*T,c=(e[0]-t[0])*n,o=(e[1]-t[1])*T,s=c*c+o*o?Math.max(0,Math.min(1,(r*c+a*o)/(c*c+o*o))):0,i=[t[0]+(e[0]-t[0])*s,t[1]+(e[1]-t[1])*s];return{point:i,fraction:s,distance:j(h,i)}}function Q(h){const t=[0];for(let e=1;e<h.length;e++)t.push(t[e-1]+j(h[e-1],h[e]));return t}function C(h,t,e){if(t.progress>e.progress)return C(h,e,t).reverse();const n=[t.point];for(let r=t.segmentIndex+1;r<=e.segmentIndex;r++)n.push(h[r]);return n.push(e.point),n.filter((r,a)=>a===0||r[0]!==n[a-1][0]||r[1]!==n[a-1][1])}function _(h,t){let e=!1;for(let n=0,r=t.length-1;n<t.length;r=n++){const a=t[n],c=t[r];a[1]>h[1]!=c[1]>h[1]&&h[0]<(c[0]-a[0])*(h[1]-a[1])/(c[1]-a[1])+a[0]&&(e=!e)}return e}function G(h){if(h.type==="Point")return h.coordinates;if(h.type==="LineString"){const s=h.coordinates;if(!s.length)throw new Error("빈 도로 선형");const i=s.slice(1).map((d,f)=>j(s[f],d));let l=i.reduce((d,f)=>d+f,0)/2;for(let d=0;d<i.length;d++){if(l<=i[d]){const f=i[d]?l/i[d]:0;return[s[d][0]+(s[d+1][0]-s[d][0])*f,s[d][1]+(s[d+1][1]-s[d][1])*f]}l-=i[d]}return s.at(-1)}const t=h.coordinates[0];if(!t?.length)throw new Error("빈 건물 경계");const e=Math.min(...t.map(s=>s[0])),n=Math.max(...t.map(s=>s[0])),r=Math.min(...t.map(s=>s[1])),a=Math.max(...t.map(s=>s[1])),c=s=>_(s,t)&&h.coordinates.slice(1).every(i=>!_(s,i)),o=[(e+n)/2,(r+a)/2];if(c(o))return o;for(let s=3;s<=15;s+=2)for(let i=0;i<s;i++)for(let l=0;l<s;l++){const d=[e+(n-e)*(l+.5)/s,r+(a-r)*(i+.5)/s];if(c(d))return d}return t[0]}function D(h,t,e,n=8){if(Array.isArray(h))return[h];if(h.type!=="Polygon")return[G(h)];const r=h.coordinates[0];if(!r||r.length<2)return[];const a=r.slice(1).map((d,f)=>j(r[f],d)),c=Math.max(100,a.reduce((d,f)=>d+f,0)/64),o=[];for(let d=0;d<a.length;d++){const f=r[d],w=r[d+1],M=Math.max(1,Math.ceil(a[d]/c));for(let y=0;y<M;y++){const x=y/M,p=[f[0]+(w[0]-f[0])*x,f[1]+(w[1]-f[1])*x],u=t(p);u!==null&&u<=e&&o.push({point:p,distance:u})}}o.sort((d,f)=>d.distance-f.distance);const s=[],i=G(h),l=t(i);l!==null&&l<=e&&s.push(i);for(const d of o)if(!s.some(f=>j(f,d.point)<125)&&(s.push(d.point),s.length===n))break;return s}let Z=class{items=[];get length(){return this.items.length}push(t){const e=this.items;let n=e.length;for(e.push(t);n>0;){const r=n-1>>1;if(e[r].seconds<=t.seconds)break;e[n]=e[r],n=r}e[n]=t}pop(){const t=this.items,e=t[0],n=t.pop();if(!t.length||!n)return e;let r=0;for(;;){const a=r*2+1;if(a>=t.length)break;const c=a+1,o=c<t.length&&t[c].seconds<t[a].seconds?c:a;if(t[o].seconds>=n.seconds)break;t[r]=t[o],r=o}return t[r]=n,e}};function tt(h,t,e,cost){
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
}class et{
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
  mode;adjacency=[];segments=[];excluded={geometry:0,direction:0,speed:0,length:0};endpointNodes=new Map;signalNodes=new Set();signalPenaltySeconds=20;
  pointKey(point){return point[0]+","+point[1]}
  node(point,endpoint){const key=this.pointKey(point);if(endpoint){const existing=this.endpointNodes.get(key);if(existing!==undefined)return existing}const node=this.adjacency.length;this.adjacency.push([]);if(endpoint)this.endpointNodes.set(key,node);return node}
  edge(adjacency,from,to,start,end,distance,seconds,featureId,kind=this.mode,volume=0){adjacency[from].push({to,distance,seconds,coordinates:[start,end],featureId,kind,volume})}
  nearest(point,maxDistance){let nearest=null;for(const segment of this.segments){const projection=H(point,segment.start,segment.end);if(projection.distance>maxDistance||nearest&&projection.distance>=nearest.distance)continue;nearest={segment,...projection}}return nearest}
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
  edgeEstimate(edge){return edge.seconds+this.trafficSignalDelay(edge)+this.trafficVolumeDelay(edge)}
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
      {strategy:"fastest",cost:edge=>this.edgeEstimate(edge)},
      {strategy:"shortest",cost:edge=>edge.distance},
      {strategy:"avoid-traffic",cost:edge=>this.edgeEstimate(edge)+this.trafficVolumeDelay(edge)*1.5},
    ];
    const routes=[];
    for(const strategy of strategies){
      const path=tt(adjacency,source,sink,strategy.cost);
      if(!path)continue;
      const signalPenalty=path.reduce((total,edge)=>total+this.trafficSignalDelay(edge),0),trafficDelay=path.reduce((total,edge)=>total+this.trafficVolumeDelay(edge),0);
      routes.push({
        strategy:strategy.strategy,
        distance:path.reduce((total,edge)=>total+edge.distance,0),
        seconds:path.reduce((total,edge)=>total+edge.seconds,0)+signalPenalty+trafficDelay,
        signalPenalty,
        trafficDelay,
        accessDistance:path.filter(edge=>edge.kind==="access").reduce((total,edge)=>total+edge.distance,0),
        coordinates:path.map(edge=>edge.coordinates),
        featureIds:[...new Set(path.flatMap(edge=>edge.featureId===null?[]:[edge.featureId]))],
      });
    }
    if(!routes.length)return{reason:"disconnected"};
    return{routes,route:routes[0]};
  }
}const st={bus:{label:"버스",color:"#00a85a",route:!0},train:{label:"기차",color:"#ff4d28",route:!0},tram:{label:"전차",color:"#b000ff",route:!0},subway:{label:"지하철",color:"#006dff",route:!0},ship:{label:"선박",color:"#005bce",route:!0},ferry:{label:"페리",color:"#00a7bd",route:!0},air:{label:"항공",color:"#5364ff",route:!1}},nt={Bus:"bus",Train:"train",Tram:"tram",Subway:"subway",Ship:"ship",Ferry:"ferry",Airplane:"air"};function ot(h){return typeof h=="string"?nt[h]??null:null}const E=100,K=h=>[h[0]*111320,h[1]*111320],z=(h,t)=>`${h},${t}`;class V{segments=[];cells=new Map;addLine(t,e){let n=0;for(let r=1;r<e.length;r++){const a=e[r-1],c=e[r],o=j(a,c);if(!(o>0))continue;const s=this.segments.length;this.segments.push({featureId:t,segmentIndex:r-1,start:a,end:c,progressStart:n,length:o});const[i,l]=K(a),[d,f]=K(c);for(let w=Math.floor(Math.min(i,d)/E);w<=Math.floor(Math.max(i,d)/E);w++)for(let M=Math.floor(Math.min(l,f)/E);M<=Math.floor(Math.max(l,f)/E);M++){const y=z(w,M);this.cells.has(y)||this.cells.set(y,[]),this.cells.get(y).push(s)}n+=o}}nearby(t,e){const[n,r]=K(t),a=new Set,c=[];for(let o=Math.floor((n-e)/E);o<=Math.floor((n+e)/E);o++)for(let s=Math.floor((r-e)/E);s<=Math.floor((r+e)/E);s++)for(const i of this.cells.get(z(o,s))??[]){if(a.has(i))continue;a.add(i);const l=this.segments[i],d=H(t,l.start,l.end);d.distance>e||c.push({...d,progress:l.progressStart+d.fraction*l.length,segmentIndex:l.segmentIndex,featureId:l.featureId})}return c.sort((o,s)=>o.distance-s.distance||o.featureId-s.featureId||o.progress-s.progress)}nearest(t,e){return this.nearby(t,e)[0]??null}}const it={bus:"StopBus",train:"StopPassengerTrain",tram:"StopTram",subway:"StopSubway",ship:"StopPassengerShip",ferry:"StopFerry"};function rt(h){if(typeof h!="string")return null;const t=new Set(h.split(",").map(e=>e.trim()));for(const[e,n]of Object.entries(it))if(t.has(n))return e;return null}function ct(h,t,e){if(!h.length)return null;const n=h.slice().sort((o,s)=>o.progress-s.progress),r=[];for(const o of n){const s=r.at(-1);s&&o.progress-s.at(-1).progress<=25?s.push(o):r.push([o])}const a=r.map(o=>o.reduce((s,i)=>i.distance<s.distance?i:s)).sort((o,s)=>o.distance-s.distance||o.progress-s.progress),c=a.filter(o=>o.distance<=a[0].distance+5);if(c.length===2&&e){const o=c.find(i=>i.progress<=25),s=c.find(i=>t-i.progress<=25);if(o&&s&&o!==s)return{positions:[o,s],ambiguous:!1}}return{positions:[a[0]],ambiguous:c.length>1}}function at(h,t){const e=h.features.flatMap((o,s)=>{const i=rt(o.properties?.Category);return!i||o.geometry?.type!=="Point"?[]:[{id:0,sourceId:s,mode:i,point:o.geometry.coordinates,name:String(o.properties?.Name||`정류장 #${s+1}`)}]});e.forEach((o,s)=>{o.id=s});const n=[],r=[],a=e.map(()=>[]),c={ambiguous:0,tooFewStops:0};for(const[o,s]of t.features.entries()){if(s.properties?.Object!=="RoutePassenger"||s.geometry?.type!=="LineString")continue;const i=ot(s.properties.Transport);if(!i||i==="air")continue;const l=s.geometry.coordinates;if(l.length<2)continue;const d=new V;d.addLine(o,l);const f=d.segments.at(-1);if(!f)continue;const w=f.progressStart+f.length,M=j(l[0],l.at(-1))<=25,y=[];for(const S of e){if(S.mode!==i)continue;const b=ct(d.nearby(S.point,50),w,M);if(b){if(b.ambiguous){c.ambiguous++;continue}y.push({stop:S,positions:b.positions})}}const x=s.properties.Stop;if(typeof x=="number"&&Number.isInteger(x)&&(y.sort((S,b)=>S.positions[0].distance-b.positions[0].distance||S.stop.sourceId-b.stop.sourceId),y.length=Math.min(y.length,Math.max(0,x))),y.length<2){c.tooFewStops++;continue}const p=y.flatMap(({stop:S,positions:b})=>b.map(A=>({stop:S,position:A}))).sort((S,b)=>S.position.progress-b.position.progress||S.stop.sourceId-b.stop.sourceId),u=n.length,g=s.properties.Color,m=typeof g=="string"&&/^#[0-9a-fA-F]{6}$/.test(g)?g:st[i].color,I={id:u,sourceId:o,mode:i,color:m,line:l,name:String(s.properties.Name||`노선 #${o+1}`),occurrences:[]};n.push(I);const k=new Map;for(const{stop:S,position:b}of p){const A=r.length,N=k.get(S.id)??0;k.set(S.id,N+1);const F={id:A,routeId:u,stopId:S.id,position:b,occurrenceIndex:N};r.push(F),a[S.id].push(A),I.occurrences.push(A)}}return{stops:e,routes:n,occurrences:r,occurrencesByStop:a,excluded:c}}function dt(h,t,e){return C(h.routes[t.routeId].line,t.position,e.position)}let ut=class{items=[];get length(){return this.items.length}push(t){let e=this.items.length;for(this.items.push(t);e>0;){const n=e-1>>1;if(this.items[n].distance<=t.distance)break;this.items[e]=this.items[n],e=n}this.items[e]=t}pop(){const t=this.items[0],e=this.items.pop();if(!this.items.length||!e)return t;let n=0;for(;n*2+1<this.items.length;){const r=n*2+1,a=r+1,c=a<this.items.length&&this.items[a].distance<this.items[r].distance?a:r;if(this.items[c].distance>=e.distance)break;this.items[n]=this.items[c],n=c}return this.items[n]=e,t}};function ht(h){return h.slice().reverse()}function lt(h){const t=[];for(const e of h)t.push(...t.length?e.coordinates.slice(1):e.coordinates);return t}class ft{adjacency=[];stopNodes;index=new V;lines=new Map;events=new Map;endpointNodes=new Map;stopAtNode=new Map;activeStops=new Set;componentIds=new Int32Array(0);componentSizes=[];featureComponents=new Map;constructor(t,e,n){this.stopNodes=e.map(()=>null);for(const c of n)this.activeStops.add(c);const r=new Set,a=new Map;for(const c of t.features){if(!this.walkable(c.properties??{}))continue;const o=c.geometry?.coordinates;if(!(!o||o.length<2)){r.add(this.key(o[0])),r.add(this.key(o.at(-1)));for(const s of o){const i=this.key(s);a.set(i,(a.get(i)??0)+1)}}}for(const[c,o]of t.features.entries()){if(!this.walkable(o.properties??{}))continue;const s=o.geometry?.coordinates;if(!s||s.length<2)continue;this.lines.set(c,s),this.index.addLine(c,s);const i=Q(s),l=[];for(let d=0;d<s.length;d++){if(d!==0&&d!==s.length-1&&!r.has(this.key(s[d]))&&(a.get(this.key(s[d]))??0)<2)continue;const f=s[d],w=this.endpoint(f);l.push({node:w,position:{point:f,distance:0,progress:i[d],segmentIndex:Math.min(d,s.length-2),fraction:d===s.length-1?1:0}})}this.events.set(c,l)}for(const c of e){if(!this.activeStops.has(c.id))continue;const o=this.index.nearest(c.point,150);if(!o)continue;const s=this.node(),i=this.node();this.stopNodes[c.id]=s,this.stopAtNode.set(s,c.id),this.events.get(o.featureId).push({node:i,position:o}),this.connect(s,i,[c.point,o.point],o.distance)}for(const[c,o]of this.events){const s=this.lines.get(c);o.sort((i,l)=>i.position.progress-l.position.progress||i.node-l.node);for(let i=1;i<o.length;i++){const l=o[i-1],d=o[i],f=Math.max(0,d.position.progress-l.position.progress),w=C(s,l.position,d.position);this.connect(l.node,d.node,w,f)}}
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
  walkable(t){return O(t.Object,"Pathway")||O(t.Object,"Road")&&t.Category!=="Highway"}key(t){return`${t[0]},${t[1]}`}node(){const t=this.adjacency.length;return this.adjacency.push([]),t}endpoint(t){const e=this.key(t),n=this.endpointNodes.get(e);if(n!==void 0)return n;const r=this.node();return this.endpointNodes.set(e,r),r}connect(t,e,n,r,a=this.adjacency){t!==e&&(a[t].push({to:e,distance:r,coordinates:n}),a[e].push({to:t,distance:r,coordinates:ht(n)}))}search(t,e,n){const r=new Float64Array(t.length).fill(1/0),a=Array(t.length),c=new Int32Array(t.length).fill(-1),o=new ut,s=new Map;for(r[e]=0,o.push({node:e,distance:0});o.length;){const i=o.pop();if(i.distance!==r[i.node]||i.distance>n)continue;const l=this.stopAtNode.get(i.node);if(l!==void 0){const d=[];for(let f=i.node;f!==e;f=c[f]){const w=a[f];if(!w)break;d.push(w)}s.set(l,{distance:i.distance,seconds:i.distance/v.walkingMetersPerSecond,coordinates:lt(d.reverse())})}for(const d of t[i.node]){const f=i.distance+d.distance;f>n||f>=r[d.to]||(r[d.to]=f,a[d.to]=d,c[d.to]=i.node,o.push({node:d.to,distance:f}))}}return s}fromStop(t,e){const n=this.stopNodes[t];return n===null?new Map:this.search(this.adjacency,n,e)}fromPlace(t,e){const n=Math.min(v.walkingSnapMeters,e),r=this.index.nearby(t,n),a=r[0];if(!a)return new Map;const c=this.adjacency.slice(),o=c.length;c.push([]);const s=Math.min(n,Math.max(75,a.distance+25)),i=new Set;for(const l of r){if(l.distance>s||i.size>=30)break;if(i.has(l.featureId))continue;i.add(l.featureId);const d=this.events.get(l.featureId),f=this.lines.get(l.featureId);let w=d.findIndex(y=>y.position.progress>=l.progress);w<0&&(w=d.length-1);const M=new Set([Math.max(0,w-1),w]);for(const y of M){const x=d[y],p=C(f,l,x.position),u=[t,l.point,...p.slice(1)],g=l.distance+Math.abs(l.progress-x.position.progress);c[x.node]=c[x.node].slice(),this.connect(o,x.node,u,g,c)}}return this.search(c,o,e)}}const pt={bus:25,train:60,tram:22,subway:40,ship:30,ferry:20},L=300,Y=120;class gt{items=[];get length(){return this.items.length}push(t){let e=this.items.length;for(this.items.push(t);e;){const n=e-1>>1;if(this.items[n].seconds<=t.seconds)break;this.items[e]=this.items[n],e=n}this.items[e]=t}pop(){const t=this.items[0],e=this.items.pop();if(this.items.length){let n=0;for(;2*n+1<this.items.length;){const r=2*n+1,a=r+1,c=a<this.items.length&&this.items[a].seconds<this.items[r].seconds?a:r;if(this.items[c].seconds>=e.seconds)break;this.items[n]=this.items[c],n=c}this.items[n]=e}return t}}function $(h,t=h.coordinates){return{kind:"walk",distance:h.distance,seconds:h.seconds,coordinates:t}}function W(h,t){return{kind:"wait",distance:0,seconds:h,coordinates:[],stopPoint:t}}function mt(h){const t=[];for(const e of h){const n=t.at(-1);e.kind==="ride"&&n?.kind==="ride"&&n.routeId===e.routeId&&n.coordinates.length&&e.coordinates.length&&j(n.coordinates.at(-1),e.coordinates[0])<.1?(n.distance+=e.distance,n.seconds+=e.seconds,n.toStop=e.toStop,n.coordinates.push(...e.coordinates.slice(1))):t.push({...e,coordinates:e.coordinates.slice()})}return t}const SUBWAY_STATION_WALK_SECONDS=180;
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
  routeOne(origin,destination,strategy){
    if(!this.data.occurrences.length)return{reason:"no-service"};
    const origins=this.access(origin,strategy),destinations=this.access(destination,strategy),estimatedAccess=[...origins.values(),...destinations.values()].some(access=>access.estimated===true);
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
    return{journey:{strategy,legs:merged,distance:merged.reduce((total,leg)=>total+leg.distance,0),seconds:merged.reduce((total,leg)=>total+leg.seconds,0),walkingDistance:merged.filter(leg=>leg.kind==="walk").reduce((total,leg)=>total+leg.distance,0),transfers:states[bestKey].transfers,estimatedAccess,accessDebug:{origin:origins.debug,destination:destinations.debug},assumptions:["stops inferred from route geometry","bidirectional service","mode-specific stop dwell time","subway access chooses the fastest entrance plus 3-minute station walk","no fixed wait or transfer penalty","no transfer walking distance limit"]}};
  }
  route(origin,destination){
    const journeys=[this.routeOne(origin,destination,"shortest-time"),this.routeOne(origin,destination,"least-walking"),this.routeOne(origin,destination,"fewest-transfers")].filter(result=>result.journey).map(result=>result.journey);
    if(!journeys.length)return this.routeOne(origin,destination,"shortest-time");
    return{journeys,journey:journeys[0]};
  }
}let B=null,R=null,RB=null,q=null,P="",SU=null;self.onmessage=h=>{const t=h.data;if(t.type==="init"){if(t.configVersion!==v.version)return;P=t.datasetId,q=t.network,SU=t.subwayEntrances??null,B=new et("vehicle",t.network),self.postMessage({type:"ready",datasetId:P,excluded:B.excluded});return}if(t.type==="transit-data"){if(P!==t.datasetId||t.configVersion!==v.version||!q)return;RB=new yt(q,t.pois,t.routes,null);try{try{R=new yt(q,t.pois,t.routes,SU)}catch(error){console.warn("Subway entrance routing disabled:",error instanceof Error?error.message:String(error)),SU=null,R=RB}B.applyTrafficLights(t.pois),self.postMessage({type:"transit-ready",datasetId:P,routes:R.data.routes.length,stops:R.data.occurrences.length,excluded:R.data.excluded})}catch(e){self.postMessage({type:"transit-error",datasetId:P,error:e instanceof Error?e.message:String(e)})}return}if(t.type==="route-transit"){if(!R||P!==t.datasetId||t.configVersion!==v.version){self.postMessage({type:"transit-result",requestId:t.requestId,datasetId:t.datasetId,error:"대중교통 경로 데이터가 준비되지 않았습니다."});return}try{self.postMessage({type:"transit-result",requestId:t.requestId,datasetId:P,outcome:(()=>{const primary=R.route(t.origin,t.destination);if(primary?.journey||!RB||RB===R)return primary;const fallback=RB.route(t.origin,t.destination);return fallback?.journey?{...fallback,entranceFallback:true}:primary})()})}catch(e){self.postMessage({type:"transit-result",requestId:t.requestId,datasetId:P,error:e instanceof Error?e.message:String(e)})}return}if(!B||P!==t.datasetId||t.configVersion!==v.version){self.postMessage({type:"error",requestId:t.requestId,datasetId:t.datasetId,error:"도로 데이터가 준비되지 않았습니다."});return}self.postMessage({type:"result",requestId:t.requestId,datasetId:P,outcome:B.route(t.origin,t.destination)})}})();
