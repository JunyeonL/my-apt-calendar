import {assess,eventsFor,chooseModel,normalizeDate} from './eligibility.mjs';

const $=id=>document.getElementById(id);
const K_PROFILE='aptCompassProfileV1', K_FAV='aptCompassFavoritesV1', K_MARKET='aptCompassMarketV1';
const EMPTY_PROFILE={region:'',city:'',residenceSince:'',accountSince:'',homelessSince:'',ownsHome:'unknown',marriedAt:'',childBirths:[],deposit:'unknown',preferredArea:84};
const read=(key,fallback)=>{try {const x=JSON.parse(localStorage.getItem(key));return x??fallback;}catch{return fallback;}};
const store=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
let profile={...EMPTY_PROFILE,...read(K_PROFILE,{})};
let favorites=read(K_FAV,[]); if(!Array.isArray(favorites)) favorites=[];
let valuations=read(K_MARKET,{});
const now=new Date(), selectedNow=new Date(now.getFullYear(),now.getMonth(),1);
let currentMonth=selectedNow, data={items:[],updatedAt:null}, isDemo=false, selectedDetail=null;
let region='capital',statusFilter='all',savedOnly=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateStr=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const koreanToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const formatDate=s=>normalizeDate(s)?`${Number(s.slice(5,7))}월 ${Number(s.slice(8,10))}일`:'일정 미정';
const price=manwon=>typeof manwon==='number'&&Number.isFinite(manwon)?(manwon>=10000?`${(manwon/10000).toFixed(2).replace(/\.00$/,'')}억`:`${Math.round(manwon).toLocaleString('ko-KR')}만`):'정보 없음';
const marginText=m=>typeof m==='number'&&Number.isFinite(m)?`${m>=0?'+':'−'}${price(Math.abs(m))}`:'분석 전';
const monthKey=s=>s?.slice(0,7);
const safeUrl=s=>{try {const u=new URL(s);return u.protocol==='https:'&&['www.applyhome.co.kr','applyhome.co.kr'].includes(u.hostname)?u.href:'';}catch{return '';}};
const sample=(day,name,region,city,type,value)=>{
  const d=dateStr(now.getFullYear(),now.getMonth(),day), tomorrow=dateStr(now.getFullYear(),now.getMonth(),Math.min(day+1,28));
  return {id:`DEMO-${day}`,name,region,address:`${region==='경기'?'경기도':'서울특별시'} ${city} (가상 주소)`,category:'apt',housingType:'민영',announcementDate:dateStr(now.getFullYear(),now.getMonth(),Math.max(1,day-6)),url:null,models:[{type:'084.0000A',area:84,priceManwon:value}],dates:{SPSPLY_RCEPT_BGNDE:d,SPSPLY_RCEPT_ENDDE:d,GNRL_RNK1_ETC_AREA_RCPTDE:tomorrow,GNRL_RNK1_ETC_GG_RCPTDE:tomorrow,GNRL_RNK1_CRSPAREA_RCPTDE:tomorrow},households:200};
};
const demoData=[sample(4,'수원 그린파크 (예시)','경기','수원시',84,94500),sample(10,'동탄 센트럴 (예시)','경기','화성시',84,78000),sample(16,'서초 프리미엄 (예시)','서울','서초구',84,220000),sample(20,'용인 스카이뷰 (예시)','경기','용인시',84,87000),sample(26,'송파 리버뷰 (예시)','서울','송파구',84,195000)];

function items(){return isDemo?demoData:data.items;}
function getEvents(){return items().flatMap(x=>eventsFor(x,profile));}
function visibleEvent(e){
  if(region==='capital'&&!['서울','경기','인천'].includes(e.listing.region))return false;
  if(region!=='capital'&&region!=='all'&&region!==e.listing.region)return false;
  if(savedOnly&&!favorites.includes(e.listing.id))return false;
  if(statusFilter!=='all'&&assess(e,profile).status!==statusFilter)return false;
  return true;
}
function evalFor(item){
 const evs=eventsFor(item,profile);
 const assessments=evs.map(e=>assess(e,profile));
 return assessments.find(x=>x.status==='possible')||assessments.find(x=>x.status==='review')||assessments[0]||{status:'review',text:'확인 필요',notes:[]};
}
function valueFor(item,model){return valuations[`${item.id}|${model?.type||''}`]??null;}
function marginFor(item,model){const v=valueFor(item,model);return Number.isFinite(Number(v))&&v!==null&&model&&model.priceManwon!=null?Number(v)-model.priceManwon:null;}
function choice(item){return chooseModel(item,Number(profile.preferredArea)||84);}
function render(){
 const year=currentMonth.getFullYear(), m=currentMonth.getMonth(), key=dateStr(year,m,1).slice(0,7);
 $('month-name').textContent=`${year}년 ${m+1}월`; $('today-label').textContent=formatDate(koreanToday());
 const evs=getEvents().filter(visibleEvent), monthEvs=evs.filter(e=>monthKey(e.date)===key);
 const unique=new Map(monthEvs.map(e=>[e.listing.id,e.listing]));
 $('metric-month').textContent=new Set(monthEvs.map(e=>e.listing.id)).size;
 $('metric-possible').textContent=new Set(monthEvs.filter(e=>assess(e,profile).status==='possible').map(e=>e.listing.id)).size;
 $('metric-review').textContent=new Set(monthEvs.filter(e=>assess(e,profile).status==='review').map(e=>e.listing.id)).size;
 $('metric-saved').textContent=favorites.length;
 const weekdays=['일','월','화','수','목','금','토'];
 let html=weekdays.map((d,i)=>`<div class="weekday ${i===0?'sun':''}" role="columnheader">${d}</div>`).join('');
 const first=new Date(year,m,1).getDay(), count=new Date(year,m+1,0).getDate(), cells=Math.ceil((first+count)/7)*7;
 for(let i=0;i<cells;i++){
  const n=i-first+1, inMonth=n>0&&n<=count, actual=new Date(year,m,n), s=dateStr(actual.getFullYear(),actual.getMonth(),actual.getDate());
  const dayEvs=evs.filter(e=>e.date===s).sort((a,b)=>a.kind.localeCompare(b.kind));
  const max=window.innerWidth<650?2:3;
  html+=`<div class="calendar-day ${inMonth?'':'outside'} ${s===koreanToday()?'today':''}" role="gridcell"><span class="day-number">${actual.getDate()}</span>${dayEvs.slice(0,max).map(e=>{
   const a=assess(e,profile), model=choice(e.listing), margin=marginFor(e.listing,model);
   return `<button type="button" class="event ${a.status==='review'?'review':a.status==='no'?'no':''}" data-event="${esc(e.id)}" title="${esc(e.listing.name)} · ${esc(e.label)}"><strong>${esc(e.listing.name)}</strong><span class="event-info"><span>${esc(e.listing.region)} · ${a.status==='possible'?'기본 충족':a.status==='no'?'미충족':'확인'}</span><em>${margin===null?'차액 —':esc(marginText(margin))}</em></span></button>`;
  }).join('')}${dayEvs.length>max?`<span class="more">+${dayEvs.length-max}개 더</span>`:''}</div>`;
 }
 $('calendar').innerHTML=html;
 $('calendar').querySelectorAll('[data-event]').forEach(el=>el.addEventListener('click',()=>{const e=evs.find(x=>x.id===el.dataset.event);if(e)openDetail(e.listing,e)}));
 const monthly=[...unique.values()].sort((a,b)=>(eventsFor(a,profile).find(e=>monthKey(e.date)===key)?.date||'').localeCompare(eventsFor(b,profile).find(e=>monthKey(e.date)===key)?.date||''));
 if(!monthly.length){$('listings').innerHTML='<div class="empty"><strong>표시할 청약 공고가 없어요</strong>선택한 달·지역에 접수 일정이 없거나, 아직 공식 데이터를 가져오지 못했어요.</div>'}
 else {
  $('listings').innerHTML=monthly.map(x=>{
   const e=eventsFor(x,profile).find(e=>monthKey(e.date)===key), as=evalFor(x), mo=choice(x), ma=marginFor(x,mo);
   return `<button class="listing" type="button" data-listing="${esc(x.id)}"><span class="listing-date"><strong>${Number((e?.date||'').slice(8))||'-'}</strong><small>${esc(e?.label||'공고')}</small></span><span class="listing-info"><strong>${esc(x.name)}</strong><small>${esc(x.region)} · ${esc(x.address)} · ${esc(mo?.area>0?`${Math.round(mo.area)}㎡`: '면적 미상')}</small></span><span class="listing-side"><span class="status-pill ${as.status==='review'?'review':as.status==='no'?'no':''}">${esc(as.text)}</span><strong>${esc(marginText(ma))}</strong></span></button>`;
  }).join('');
  $('listings').querySelectorAll('[data-listing]').forEach(el=>el.addEventListener('click',()=>{const x=monthly.find(x=>x.id===el.dataset.listing);if(x)openDetail(x)}));
 }
}
function openDetail(item,event){
 selectedDetail={item,event};
 const ev=event||eventsFor(item,profile)[0]||{label:'공고 확인',date:item.announcementDate,listing:item,kind:'notice'};
 const a=assess(ev,profile), model=choice(item);
 let info=`<div class="eyebrow">${isDemo?'가상 예시 공고':'OFFICIAL APPLYHOME DATA'}</div><h2 id="detail-title">${esc(item.name)}</h2><div class="modal-badges"><span class="modal-badge">${esc(item.region)}</span><span class="modal-badge">${esc(item.category==='remaining'?'무순위/잔여':item.housingType||'APT')}</span><span class="status-pill ${a.status==='review'?'review':a.status==='no'?'no':''}">${esc(a.text)}</span></div><div class="detail-grid"><div class="detail-box"><small>모집공고일</small><strong>${esc(formatDate(item.announcementDate))}</strong></div><div class="detail-box"><small>접수일 / 구분</small><strong>${esc(formatDate(ev.date))} · ${esc(ev.label)}</strong></div><div class="detail-box"><small>주소</small><strong>${esc(item.address)}</strong></div><div class="detail-box"><small>모집 세대</small><strong>${item.households?`${Number(item.households).toLocaleString('ko-KR')}세대`:'미확인'}</strong></div></div><div class="section-title">내 청약 자격 예비 분석</div><div class="detail-note">${a.notes.map(n=>`· ${esc(n)}`).join('<br>')}</div>`;
 info+=`<div class="section-title">주택형별 분양가와 예상 차액</div>`;
 if(item.models?.length){
  info+=`<div class="manual-input"><label>비교할 주택형<select id="model-select">${item.models.map((m,i)=>`<option value="${i}" ${model?.type===m.type?'selected':''}>${esc(m.type)} (${m.area==null?'면적 미상':`${m.area}㎡`}) · ${esc(price(m.priceManwon))}</option>`).join('')}</select></label><label>주변 비교 시세 (만원)<input type="number" inputmode="numeric" id="market-value" min="1" step="100" placeholder="시세 직접 입력" /></label><button class="button button-primary" type="button" id="market-save">적용</button></div><p class="muted" id="margin-preview"></p><p class="muted">비교 시세는 직접 입력합니다. 주변 실거래 자동 매칭은 현재 지원하지 않으며, 차액은 실현 수익을 보장하지 않습니다.</p>`;
 }else info+='<p class="muted">공식 API에 주택형별 분양가가 없어 차액 계산이 불가능합니다.</p>';
 info+=`<div class="link-row"><button type="button" id="toggle-fav">${favorites.includes(item.id)?'★ 관심 해제':'☆ 관심 단지 저장'}</button>${!isDemo&&safeUrl(item.url)?`<a target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(item.url))}">청약홈 상세 열기 ↗</a>`:`<a target="_blank" rel="noopener noreferrer" href="https://www.applyhome.co.kr">청약홈 방문 ↗</a>`}</div><p class="muted">청약홈 원본 페이지는 외부 사이트이므로 새 탭에서 열립니다. 원본 페이지 정책에 따라 직접 연결이 제한될 수 있습니다.</p>`;
 $('detail-content').innerHTML=info;
 $('modal-backdrop').hidden=false;
 $('toggle-fav').addEventListener('click',()=>{favorites=favorites.includes(item.id)?favorites.filter(id=>id!==item.id):[...favorites,item.id];store(K_FAV,favorites);openDetail(item,ev);render()});
 if(item.models?.length){
   const select=$('model-select'), input=$('market-value'), preview=$('margin-preview');
   const update=()=>{const m=item.models[Number(select.value)],v=valueFor(item,m);input.value=v??'';const diff=marginFor(item,m);preview.textContent=`분양최고가 ${price(m.priceManwon)} · 예상 차액 ${marginText(diff)}${v===null?' (비교시세 미입력)':''}`;};
   select.addEventListener('change',update); update();
   $('market-save').addEventListener('click',()=>{const m=item.models[Number(select.value)],val=Number(input.value);if(!Number.isFinite(val)||val<=0){alert('만원 단위의 비교 시세를 입력해 주세요.');return;}valuations[`${item.id}|${m.type}`]=val;store(K_MARKET,valuations);update();render();});
 }
}
function closeDetail(){$('modal-backdrop').hidden=true;selectedDetail=null;}
function openSettings(){
 const form=$('profile-form');
 for(const name of ['region','city','residenceSince','accountSince','homelessSince','ownsHome','marriedAt','deposit','preferredArea']) form.elements[name].value=profile[name]??'';
 form.elements.childBirths.value=(profile.childBirths||[]).join(', ');
 $('settings-backdrop').hidden=false;
}
function closeSettings(){$('settings-backdrop').hidden=true;}
function initEvents(){
 $('previous').addEventListener('click',()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);render();});
 $('next').addEventListener('click',()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);render();});
 $('this-month').addEventListener('click',()=>{currentMonth=selectedNow;render();});
 $('region-filter').addEventListener('change',e=>{region=e.target.value;render()});
 $('status-filter').addEventListener('change',e=>{statusFilter=e.target.value;render()});
 $('saved-only').addEventListener('change',e=>{savedOnly=e.target.checked;render()});
 $('settings-button').addEventListener('click',openSettings);
 $('settings-close').addEventListener('click',closeSettings);
 $('detail-close').addEventListener('click',closeDetail);
 $('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))closeDetail()});
 $('settings-backdrop').addEventListener('click',e=>{if(e.target===$('settings-backdrop'))closeSettings()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDetail();closeSettings()}});
 $('profile-reset').addEventListener('click',()=>{if(confirm('이 브라우저의 개인 청약 조건을 초기화할까요?')){profile={...EMPTY_PROFILE};localStorage.removeItem(K_PROFILE);openSettings();render()}});
 $('profile-form').addEventListener('submit',e=>{
  e.preventDefault();const form=e.currentTarget;
  const births=String(form.elements.childBirths.value).split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
  if(births.some(x=>!normalizeDate(x))){alert('자녀 출생일을 YYYY-MM-DD 형식으로 입력해 주세요.');return;}
  profile={...EMPTY_PROFILE,...Object.fromEntries(['region','city','residenceSince','accountSince','homelessSince','ownsHome','marriedAt','deposit'].map(k=>[k,form.elements[k].value.trim()])),childBirths:births,preferredArea:Number(form.elements.preferredArea.value)||84};
  store(K_PROFILE,profile); closeSettings();render();
 });
}
function showBanner(){
 const box=$('data-warning');
 if(!data.items?.length){
  box.hidden=false;
  box.innerHTML=`<strong>${isDemo?'체험 모드 · 실제 공고가 아닌 가상 데이터입니다.':'공식 데이터가 아직 연결되지 않았어요.'}</strong> ${isDemo?'디자인과 기능을 체험할 수 있어요. 분양가·날짜·시세는 모두 가상입니다.':'공공데이터포털 API 키를 GitHub Secrets에 추가하고 데이터 동기화 작업을 실행하면 실제 공고가 나타납니다.'} <button type="button" id="sample-toggle">${isDemo?'빈 데이터로 돌아가기':'가상 데이터로 미리보기'}</button>`;
  $('sample-toggle').addEventListener('click',()=>{isDemo=!isDemo;showBanner();render();});
 }else{box.hidden=false;box.innerHTML=`<strong>공식 공고 ${data.items.length}건</strong> · 마지막 수집: ${data.updatedAt?esc(new Date(data.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})):'미확인'} · 금액과 자격은 반드시 원문을 확인하세요.`;}
 $('sync-indicator').textContent=data.items?.length?`● ${data.items.length}건 동기화`:'● API 연결 필요';
}
async function boot(){
 initEvents();
 try{
  const res=await fetch(`data/listings.json?v=${Date.now()}`,{cache:'no-store'});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const json=await res.json();
  if(!Array.isArray(json.items))throw new Error('잘못된 데이터 형식');
  data=json;
 }catch(error){console.error('Unable to read official dataset',error);data={items:[],updatedAt:null};}
 showBanner();render();
}
boot();
