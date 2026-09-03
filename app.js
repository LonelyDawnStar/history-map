const svg = d3.select('#worldMap');
const viewport = svg.select('#viewport');
const baseLayer = svg.select('#baseLayer');
const territoryLayer = svg.select('#territoryLayer');
const borderLayer = svg.select('#borderLayer');
const labelLayer = svg.select('#labelLayer');
const eventLayer = svg.select('#eventLayer');
const draftLayer = svg.select('#draftLayer');
const statusEl = document.getElementById('mapStatus');
const helpEl = document.getElementById('toolHelp');
const countryListEl = document.getElementById('countryList');
const yearInput = document.getElementById('yearInput');
const timeline = document.getElementById('timeline');
const eventDialog = document.getElementById('eventDialog');

const W = 1200, H = 620;
const state = {
  tool: 'pan', countries: [], borders: [], fills: [], events: [],
  activeCountryId: null, pendingEventPoint: null, year: 1936, history: [],
  drawing: false, draftStroke: [], landPathString: '', landPath2D: null
};
let currentTransform = d3.zoomIdentity;
let landMask = null;

const zoom = d3.zoom()
  .scaleExtent([0.7, 14])
  .filter(event => state.tool === 'pan' || event.type === 'wheel')
  .on('zoom', event => {
    currentTransform = event.transform;
    viewport.attr('transform', currentTransform);
  });
svg.call(zoom);

function uid(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(); }
function yearVisible(item){ return state.year >= Number(item.fromYear ?? -99999) && state.year <= Number(item.toYear ?? 99999); }
function activeCountry(){ return state.countries.find(c => c.id === state.activeCountryId); }
function snapshot(){
  state.history.push(JSON.stringify({countries:state.countries,borders:state.borders,fills:state.fills,events:state.events,activeCountryId:state.activeCountryId,year:state.year}));
  if(state.history.length>40) state.history.shift();
}
function restoreSnapshot(raw){
  const d=JSON.parse(raw); state.countries=d.countries||[]; state.borders=d.borders||[]; state.fills=d.fills||[]; state.events=d.events||[]; state.activeCountryId=d.activeCountryId||null; state.year=Number(d.year??1936);
  yearInput.value=state.year; if(state.year>=1800&&state.year<=2100) timeline.value=state.year; renderAll();
}
function mapPoint(event){ const [sx,sy]=d3.pointer(event,svg.node()); return currentTransform.invert([sx,sy]); }

function makeLandMask(pathString){
  const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,W,H); ctx.fillStyle='#fff';
  const p=new Path2D(pathString); ctx.fill(p); state.landPath2D=p;
  landMask=ctx.getImageData(0,0,W,H).data;
}
function isLand(x,y){
  const ix=Math.round(x), iy=Math.round(y); if(ix<0||iy<0||ix>=W||iy>=H||!landMask) return false;
  return landMask[(iy*W+ix)*4+3] > 0;
}

function renderCountries(){
  countryListEl.innerHTML='';
  state.countries.forEach(country=>{
    const row=document.createElement('div'); row.className='country-item'+(country.id===state.activeCountryId?' active':''); row.tabIndex=0;
    const sw=document.createElement('span'); sw.className='swatch'; sw.style.background=country.color;
    const name=document.createElement('span'); name.textContent=country.name;
    const del=document.createElement('button'); del.type='button'; del.textContent='삭제';
    del.onclick=e=>{e.stopPropagation();snapshot();state.countries=state.countries.filter(c=>c.id!==country.id);state.fills=state.fills.filter(f=>f.countryId!==country.id);if(state.activeCountryId===country.id)state.activeCountryId=state.countries[0]?.id||null;renderAll();};
    const activate=()=>{state.activeCountryId=country.id;renderCountries();}; row.onclick=activate; row.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')activate();}; row.append(sw,name,del); countryListEl.appendChild(row);
  });
}

function buildBarrierMap(){
  const blocked=new Uint8Array(W*H);
  if(landMask){ for(let i=0;i<W*H;i++) if(landMask[i*4+3]===0) blocked[i]=1; }
  const c=document.createElement('canvas'); c.width=W;c.height=H; const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#fff';ctx.lineWidth=4;
  state.borders.filter(yearVisible).forEach(b=>{
    if(!b.points?.length)return; ctx.beginPath();ctx.moveTo(b.points[0][0],b.points[0][1]);for(let i=1;i<b.points.length;i++)ctx.lineTo(b.points[i][0],b.points[i][1]);ctx.stroke();
  });
  const d=ctx.getImageData(0,0,W,H).data; for(let i=0;i<W*H;i++) if(d[i*4+3]>0) blocked[i]=1;
  return blocked;
}

function floodRegion(seedX,seedY,blocked){
  const sx=Math.round(seedX), sy=Math.round(seedY); if(sx<0||sy<0||sx>=W||sy>=H) return [];
  const start=sy*W+sx; if(blocked[start]) return [];
  const seen=new Uint8Array(W*H); const q=new Int32Array(W*H); let head=0,tail=0; q[tail++]=start;seen[start]=1; const out=[];
  while(head<tail){
    const idx=q[head++]; out.push(idx); const x=idx%W,y=(idx/W)|0;
    if(x>0){const n=idx-1;if(!seen[n]&&!blocked[n]){seen[n]=1;q[tail++]=n;}}
    if(x<W-1){const n=idx+1;if(!seen[n]&&!blocked[n]){seen[n]=1;q[tail++]=n;}}
    if(y>0){const n=idx-W;if(!seen[n]&&!blocked[n]){seen[n]=1;q[tail++]=n;}}
    if(y<H-1){const n=idx+W;if(!seen[n]&&!blocked[n]){seen[n]=1;q[tail++]=n;}}
  }
  return out;
}

function renderTerritories(){
  territoryLayer.selectAll('*').remove(); labelLayer.selectAll('*').remove(); if(!landMask)return;
  const visibleFills=state.fills.filter(yearVisible); if(!visibleFills.length)return;
  const blocked=buildBarrierMap(); const owner=new Int32Array(W*H); owner.fill(-1); const countryIndex=new Map(state.countries.map((c,i)=>[c.id,i]));
  visibleFills.forEach(fill=>{
    const ci=countryIndex.get(fill.countryId); if(ci===undefined)return; const region=floodRegion(fill.x,fill.y,blocked); region.forEach(idx=>owner[idx]=ci);
  });
  const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');const img=ctx.createImageData(W,H);const acc=new Map();
  state.countries.forEach((country,ci)=>{
    const rgb=hexToRgb(country.color); let sx=0,sy=0,count=0;
    for(let idx=0;idx<owner.length;idx++) if(owner[idx]===ci){img.data[idx*4]=rgb.r;img.data[idx*4+1]=rgb.g;img.data[idx*4+2]=rgb.b;img.data[idx*4+3]=150;sx+=idx%W;sy+=(idx/W)|0;count++;}
    if(count) acc.set(country.id,{x:sx/count,y:sy/count,count});
  });
  ctx.putImageData(img,0,0); territoryLayer.append('image').attr('href',c.toDataURL()).attr('x',0).attr('y',0).attr('width',W).attr('height',H).attr('class','territory-raster');
  state.countries.forEach(country=>{const a=acc.get(country.id);if(!a)return;labelLayer.append('text').attr('class','country-label').attr('x',a.x).attr('y',a.y).text(country.name);});
}
function hexToRgb(hex){const v=hex.replace('#','');return{r:parseInt(v.slice(0,2),16),g:parseInt(v.slice(2,4),16),b:parseInt(v.slice(4,6),16)};}

function renderBorders(){
  borderLayer.selectAll('polyline').data(state.borders.filter(yearVisible),d=>d.id).join('polyline').attr('class','border-line').attr('points',d=>d.points.map(p=>p.join(',')).join(' '));
}
const eventSymbols={war:'⚔',politics:'◆',diplomacy:'✦',foundation:'★',collapse:'✖',other:'●'};
function renderEvents(){
  const groups=eventLayer.selectAll('g.event-marker').data(state.events.filter(yearVisible),d=>d.id).join(enter=>{const g=enter.append('g').attr('class','event-marker');g.append('circle').attr('r',8).attr('fill','#fff').attr('stroke','#222').attr('stroke-width',1.5).attr('vector-effect','non-scaling-stroke');g.append('text').attr('class','event-label').attr('x',12).attr('y',4);return g;});
  groups.attr('transform',d=>`translate(${d.x},${d.y})`).on('click',(event,d)=>{event.stopPropagation();alert(`${eventSymbols[d.type]||'●'} ${d.title}\n${d.date||d.fromYear||''}\n\n${d.description||''}`);});
  groups.select('text').text(d=>`${eventSymbols[d.type]||'●'} ${d.title}`);
}
function renderDraft(){draftLayer.selectAll('*').remove();if(state.draftStroke.length>1)draftLayer.append('polyline').attr('class','draft-line freehand').attr('points',state.draftStroke.map(p=>p.join(',')).join(' '));}
function renderAll(){renderCountries();renderTerritories();renderBorders();renderEvents();renderDraft();}

const toolHelp={
  pan:'이동 도구: 지도를 드래그하고 확대/축소할 수 있습니다.',
  border:'국경 도구: 육지 위를 손가락이나 펜으로 자유롭게 드래그하세요. 바다에는 그려지지 않습니다.',
  fill:'영토 도구: 국가를 선택한 뒤 국경으로 둘러싸인 육지를 누르면 페인트통처럼 채워집니다.',
  event:'사건 도구: 지도에서 위치를 누른 뒤 사건 정보를 입력하세요.'
};
document.querySelectorAll('.tool').forEach(btn=>btn.addEventListener('click',()=>{
  state.tool=btn.dataset.tool;state.drawing=false;state.draftStroke=[];document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b===btn));helpEl.textContent=toolHelp[state.tool];svg.style('cursor',state.tool==='pan'?'grab':state.tool==='fill'?'cell':'crosshair');renderDraft();
}));

svg.on('pointerdown.editor',event=>{
  if(state.tool!=='border')return; event.preventDefault(); const [x,y]=mapPoint(event); if(!isLand(x,y))return; state.drawing=true;state.draftStroke=[[x,y]];svg.node().setPointerCapture?.(event.pointerId);renderDraft();
});
svg.on('pointermove.editor',event=>{
  if(state.tool!=='border'||!state.drawing)return;event.preventDefault();const [x,y]=mapPoint(event);if(!isLand(x,y)){if(state.draftStroke.length>1){snapshot();state.borders.push({id:uid(),points:state.draftStroke.map(p=>[+p[0].toFixed(1),+p[1].toFixed(1)]),fromYear:state.year,toYear:9999});state.draftStroke=[];renderAll();}return;}
  const last=state.draftStroke.at(-1);if(!last||Math.hypot(x-last[0],y-last[1])>1.8){state.draftStroke.push([x,y]);renderDraft();}
});
function finishStroke(){if(state.tool!=='border'||!state.drawing)return;state.drawing=false;if(state.draftStroke.length>1){snapshot();state.borders.push({id:uid(),points:state.draftStroke.map(p=>[+p[0].toFixed(1),+p[1].toFixed(1)]),fromYear:state.year,toYear:9999});}state.draftStroke=[];renderAll();}
svg.on('pointerup.editor',finishStroke);svg.on('pointercancel.editor',finishStroke);

svg.on('click.editor',event=>{
  if(state.tool==='fill'){
    const country=activeCountry();if(!country){alert('먼저 국가를 추가하고 선택해 주세요.');return;}const [x,y]=mapPoint(event);if(!isLand(x,y)){statusEl.style.opacity='1';statusEl.textContent='바다는 영토로 지정할 수 없습니다.';setTimeout(()=>statusEl.style.opacity='0',1200);return;}
    snapshot();state.fills.push({id:uid(),countryId:country.id,x:+x.toFixed(1),y:+y.toFixed(1),fromYear:state.year,toYear:9999});renderTerritories();return;
  }
  if(state.tool==='event'){
    const [x,y]=mapPoint(event);state.pendingEventPoint={x,y};document.getElementById('eventTitle').value='';document.getElementById('eventDate').value=state.year>0&&state.year<=9999?`${String(state.year).padStart(4,'0')}-01-01`:'';document.getElementById('eventDescription').value='';eventDialog.showModal();
  }
});

document.getElementById('addCountryBtn').addEventListener('click',()=>{
  const n=document.getElementById('countryName'),c=document.getElementById('countryColor'),name=n.value.trim();if(!name)return;snapshot();const country={id:uid(),name,color:c.value};state.countries.push(country);state.activeCountryId=country.id;n.value='';renderAll();
});
document.getElementById('clearBordersBtn').addEventListener('click',()=>{if(!state.borders.length)return;snapshot();state.borders=[];renderAll();});
document.getElementById('undoBtn').addEventListener('click',()=>{const raw=state.history.pop();if(raw)restoreSnapshot(raw);});
function setYear(value){const n=Math.max(-5000,Math.min(3000,Number(value)||0));state.year=n;yearInput.value=n;if(n>=1800&&n<=2100)timeline.value=n;renderTerritories();renderBorders();renderEvents();}
yearInput.addEventListener('change',e=>setYear(e.target.value));timeline.addEventListener('input',e=>setYear(e.target.value));document.getElementById('yearDown').onclick=()=>setYear(state.year-1);document.getElementById('yearUp').onclick=()=>setYear(state.year+1);

document.getElementById('eventForm').addEventListener('submit',e=>{e.preventDefault();const title=document.getElementById('eventTitle').value.trim();if(!title||!state.pendingEventPoint)return;snapshot();const date=document.getElementById('eventDate').value;state.events.push({id:uid(),title,date,type:document.getElementById('eventType').value,description:document.getElementById('eventDescription').value.trim(),x:state.pendingEventPoint.x,y:state.pendingEventPoint.y,fromYear:date?Number(date.slice(0,4)):state.year,toYear:9999});state.pendingEventPoint=null;eventDialog.close();renderEvents();});
document.getElementById('cancelEventBtn').onclick=()=>{state.pendingEventPoint=null;eventDialog.close();};

document.getElementById('exportBtn').addEventListener('click',()=>{
  const data={version:2,savedAt:new Date().toISOString(),year:state.year,countries:state.countries,borders:state.borders,fills:state.fills,events:state.events};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='history-map-project.json';a.click();URL.revokeObjectURL(url);
});
document.getElementById('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const d=JSON.parse(await file.text());snapshot();state.countries=Array.isArray(d.countries)?d.countries:[];state.borders=Array.isArray(d.borders)?d.borders:[];state.fills=Array.isArray(d.fills)?d.fills:[];state.events=Array.isArray(d.events)?d.events:[];state.activeCountryId=state.countries[0]?.id||null;setYear(d.year??1936);renderAll();}catch{alert('올바른 History Map JSON 파일이 아닙니다.');}e.target.value='';});

document.getElementById('zoomInBtn').onclick=()=>svg.transition().duration(180).call(zoom.scaleBy,1.45);document.getElementById('zoomOutBtn').onclick=()=>svg.transition().duration(180).call(zoom.scaleBy,1/1.45);document.getElementById('resetViewBtn').onclick=()=>svg.transition().duration(220).call(zoom.transform,d3.zoomIdentity);

async function loadWorld(){
  try{const response=await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json');if(!response.ok)throw new Error('map load failed');const world=await response.json();const land=topojson.feature(world,world.objects.land);const projection=d3.geoNaturalEarth1().fitExtent([[22,24],[1178,596]],land);const path=d3.geoPath(projection);state.landPathString=path(land);makeLandMask(state.landPathString);baseLayer.append('path').datum(land).attr('class','base-land').attr('d',path);statusEl.textContent='국경 펜 + 페인트통 영토 모드';setTimeout(()=>statusEl.style.opacity='0',1800);renderAll();}
  catch(error){statusEl.textContent='기본 지도를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';console.error(error);}
}
loadWorld();renderAll();