import {assess,assessGeneral,assessSpecial,eventsFor,compareCalendarEvents,onCalendarDay,normalizeDate,normalizeMonthOrDate,normalizeProfile,decodeProfileFragment,DEFAULT_PROFILE,profileOverrides,resolveProfile,STATUS,calendarWeeks} from './eligibility.mjs?v=__BUILD_VERSION__';

const $=id=>document.getElementById(id);
const K_OVERRIDES='aptCompassOverridesV4', K_FAV='aptCompassFavoritesV1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The active session remains usable. */}};
const imported=decodeProfileFragment(location.hash);
let profile=imported||resolveProfile({
  overrides:read(K_OVERRIDES,null),
  oldProfile:read('aptCompassProfileV3',read('aptCompassProfileV2',read('aptCompassProfileV1',null))),
  oldBaseline:read('aptCompassDefaultsV3',read('aptCompassDefaultsV2',null))
});
const saveProfile=()=>save(K_OVERRIDES,profileOverrides(profile));
saveProfile();
if(imported) history.replaceState(null,'',location.pathname+location.search);
let favorites=read(K_FAV,[]); if(!Array.isArray(favorites)) favorites=[];
const koreanToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const today=koreanToday(), todayParts=today.split('-').map(Number);
let currentYear=todayParts[0], currentMonth=todayParts[1]-1, monthOffset=0;
let data={items:[],updatedAt:null}, isDemo=false, region='capital', statusFilter='all', savedOnly=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate=s=>normalizeDate(s)?Number(s.slice(5,7))+'월 '+Number(s.slice(8,10))+'일':'일정 미정';
const price=n=>typeof n==='number'&&Number.isFinite(n)?(n>=10000?(n/10000).toFixed(2).replace(/\.00$/,'')+'억':Math.round(n).toLocaleString('ko-KR')+'만'):'미제공';
const count=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('ko-KR'):'—';
const area=n=>typeof n==='number'&&Number.isFinite(n)?Number(n.toFixed(2))+'㎡':'면적 미상';
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&['www.applyhome.co.kr','applyhome.co.kr'].includes(u.hostname)?u.href:'';}catch{return '';}};
const modelType=s=>String(s||'미제공').replace(/^0+(?=\d)/,'');
function calendarName(name) {
  const compact=String(name||'').replace(/\(\s*(?:본청약|공공분양)\s*\)/g,' ')
    .replace(/(?:추가\s*)?입주자\s*모집\s*공고\s*$/,'').replace(/\s+/g,' ').trim();
  return compact||name;
}
const sample=(day,name,location,city,value)=>{
  const date=new Date(Date.UTC(currentYear,currentMonth,day));
  while([0,6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate()+1);
  const first=date.toISOString().slice(0,10);
  date.setUTCDate(date.getUTCDate()+1); while([0,6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate()+1);
  const second=date.toISOString().slice(0,10);
  return {id:'DEMO-'+day,name,region:location,address:(location==='경기'?'경기도':'서울특별시')+' '+city+' (가상 주소)',category:'apt',housingType:'민영',announcementDate:today,regulated:false,speculative:false,url:null,households:200,
    models:[{type:'084.0000A',area:84,priceManwon:value,supply:80,specialSupply:120,totalSupply:200,specialBreakdown:{multiChild:20,newborn:0,newlywed:50,firstHome:35,elderlyParent:5,institution:10}}],
    dates:{SPSPLY_RCEPT_BGNDE:first,GNRL_RNK1_CRSPAREA_RCPTDE:first,GNRL_RNK1_ETC_AREA_RCPTDE:first,GNRL_RNK2_CRSPAREA_RCPTDE:second,GNRL_RNK2_ETC_AREA_RCPTDE:second}};
};
const demoData=[sample(4,'수원 그린파크 (예시)','경기','수원시',94500),sample(10,'동탄 센트럴 (예시)','경기','화성시',78000),sample(16,'서초 프리미엄 (예시)','서울','서초구',220000),sample(20,'용인 스카이뷰 (예시)','경기','용인시',87000),sample(26,'송파 리버뷰 (예시)','서울','송파구',195000)];
const allItems=()=>isDemo?demoData:data.items;
const bestFor=item=>item.category==='remaining'?assess({kind:'remaining',listing:item},profile):assessGeneral(item,profile);
function visibleItem(item) {
  if(region==='capital'&&!['서울','경기','인천'].includes(item.region)) return false;
  if(!['capital','all'].includes(region)&&item.region!==region) return false;
  return !savedOnly||favorites.includes(item.id);
}
function statusPill(a) {
  return '<span class="status-pill status-'+esc(a.status)+'">'+esc(a.text)+'</span>';
}
function profileSummary() {
  const child=profile.childrenCount?' · 자녀 '+profile.childrenCount+'명':'';
  $('profile-summary').textContent=profile.city
    ?profile.region+' '+profile.city+' · '+(profile.ownsHome==='no'?'무주택':profile.ownsHome==='yes'?'유주택':'주택 여부 미입력')+child+' · 관심 '+profile.preferredArea+'㎡'
    :'내 청약 조건을 설정해 주세요.';
}
function render() {
  $('month-name').textContent=currentYear+'년 '+(currentMonth+1)+'월';
  $('previous').disabled=monthOffset===0;
  $('next').disabled=monthOffset===1;
  $('today-label').textContent=formatDate(today);
  profileSummary();
  const days=calendarWeeks(currentYear,currentMonth).flat();
  const weekdays=days.filter(day=>day.inMonth).map(day=>day.date);
  const events=allItems().filter(visibleItem).flatMap(item=>eventsFor(item,profile))
    .filter(e=>weekdays.some(date=>onCalendarDay(e,date)))
    .map(e=>({...e,assessment:assess(e,profile)})).sort(compareCalendarEvents);
  const countListings=entries=>new Set(entries.map(event=>event.listing.id)).size;
  $('metric-month').textContent=countListings(events);
  for(const status of Object.keys(STATUS)) {
    $('metric-'+status).textContent=countListings(events.filter(e=>e.assessment.status===status));
  }
  $('metric-saved').textContent=favorites.length;
  const visible=events.filter(e=>statusFilter==='all'||e.assessment.status===statusFilter);
  $('calendar-empty').hidden=visible.length>0;
  let html=['월','화','수','목','금'].map(d=>'<div class="weekday" role="columnheader">'+d+'</div>').join('');
  for(const day of days) {
    html+='<div class="calendar-day '+(!day.inMonth?'outside ':'')+(day.date===today?'today':'')+'" role="gridcell" aria-label="'+day.date+'"><span class="day-number">'+day.day+'</span>';
    if(day.inMonth) for(const event of visible.filter(e=>onCalendarDay(e,day.date))) {
      const a=event.assessment, name=event.listing.name;
      const label=esc(name+' · '+event.label+' · '+a.text);
      html+='<button type="button" class="event status-'+esc(a.status)+'" data-event="'+esc(event.id)+'" title="'+label+'" aria-label="'+label+'">'
        +'<span class="event-status">'+esc(a.short)+'</span> <strong>'+esc(calendarName(name))+'</strong></button>';
    }
    html+='</div>';
  }
  $('calendar').innerHTML=html;
  $('calendar').querySelectorAll('[data-event]').forEach(button=>button.addEventListener('click',()=>{
    const event=visible.find(e=>e.id===button.dataset.event);
    if(event) openDetail(event.listing);
  }));
}
const supplyColumns=[
  ['multiChild','다자녀'],['newborn','신생아'],['newlywed','신혼부부'],['firstHome','생애최초'],
  ['elderlyParent','노부모'],['institution','기관추천'],['relocatedInstitution','이전기관'],['youth','청년'],['other','기타']
];
function supplyTables(item) {
  const models=item.models||[];
  if(!models.length) return '<p class="muted">공식 API에 주택형별 공급 정보가 없습니다.</p>';
  let html='<div class="table-scroll" tabindex="0" aria-label="주택형별 분양가와 모집 세대수"><table class="supply-table"><caption>금액: 주택형별 분양최고가 · 모집: 세대수</caption><thead><tr><th scope="col">주택형 / 전용면적</th><th scope="col">분양최고가</th><th scope="col">일반공급</th><th scope="col">특별공급</th><th scope="col">합계</th></tr></thead><tbody>';
  for(const m of models) {
    const total=m.totalSupply??(Number.isFinite(m.supply)&&Number.isFinite(m.specialSupply)?m.supply+m.specialSupply:null);
    html+='<tr><th scope="row">'+esc(modelType(m.type))+'<small>'+esc(area(m.area))+'</small></th><td class="supply-price">'+esc(price(m.priceManwon))+'</td><td>'+count(m.supply)+'</td><td>'+count(m.specialSupply)+'</td><td class="supply-total">'+count(total)+'</td></tr>';
  }
  html+='</tbody></table></div>';
  const columns=supplyColumns.filter(([key])=>models.some(m=>Number.isFinite(m.specialBreakdown?.[key])&&(m.specialBreakdown[key]>0||['multiChild','newborn','newlywed','firstHome','elderlyParent','institution'].includes(key))));
  if(columns.length) {
    html+='<h3 class="section-title">특별공급 유형별 모집 세대</h3><div class="table-scroll" tabindex="0" aria-label="특별공급 유형별 세대수"><table class="supply-table breakdown-table"><thead><tr><th scope="col">주택형</th>'+columns.map(([,label])=>'<th scope="col">'+label+'</th>').join('')+'</tr></thead><tbody>';
    for(const m of models) html+='<tr><th scope="row">'+esc(modelType(m.type))+'</th>'+columns.map(([key])=>'<td>'+count(m.specialBreakdown?.[key])+'</td>').join('')+'</tr>';
    html+='</tbody></table></div>';
  }
  return html+'<p class="muted table-help">0은 해당 유형 배정이 없는 경우, —는 API 미제공입니다. 작은 화면에서는 표 안에서만 좌우로 넘겨 볼 수 있어요.</p>';
}
function checklist(a) {
  const checks=a.checks.map(c=>'<li class="check-'+esc(c.state)+'"><span>'+esc(c.label)+'</span><strong>'+esc(c.value)+'</strong></li>').join('');
  return (checks?'<ul class="eligibility-checks">'+checks+'</ul>':'')+'<ul class="detail-note">'+a.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>';
}
function openDetail(item) {
  const ownEvents=eventsFor(item,profile);
  const a=bestFor(item);
  const hasSpecial=item.category==='apt'&&(ownEvents.some(e=>e.kind==='special')||item.models?.some(m=>m.specialSupply>0));
  const special=hasSpecial?assessSpecial(item,profile):null;
  let html='<div class="eyebrow">'+(isDemo?'가상 예시 공고':'청약홈 공고')+'</div><h2 id="detail-title">'+esc(item.name)+'</h2><div class="modal-badges"><span class="modal-badge">'+esc(item.region)+'</span><span class="modal-badge">'+esc(item.category==='remaining'?'무순위/잔여':item.housingType||'APT')+'</span>'+(special?statusPill(special):'')+statusPill(a)+'</div>';
  if(special) html+='<h3 class="section-title">특별공급 기본조건</h3>'+checklist(special);
  html+='<div class="detail-grid"><div class="detail-box"><small>모집공고일</small><strong>'+esc(formatDate(item.announcementDate))+'</strong></div><div class="detail-box"><small>전체 모집 규모</small><strong>'+count(item.households)+'세대</strong></div><div class="detail-box detail-address"><small>공급 위치</small><strong>'+esc(item.address)+'</strong></div></div>';
  html+='<h3 class="section-title">주택형별 분양가·모집 세대</h3>'+supplyTables(item);
  html+='<h3 class="section-title">내 접수 일정</h3><ul class="schedule-list">'+ownEvents.map(e=>'<li><strong>'+esc(e.label)+'</strong><span>'+esc(formatDate(e.date)+(e.end&&e.end>e.date?' ~ '+formatDate(e.end):''))+'</span><small>'+esc(e.regionLabel||'공고 확인')+'</small></li>').join('')+'</ul>';
  html+='<h3 class="section-title">'+(item.category==='remaining'?'무순위 자격 검토':'일반공급 순위 예비 판정')+'</h3>'+statusPill(a);
  html+=checklist(a);
  const url=!isDemo&&safeUrl(item.url)?safeUrl(item.url):'https://www.applyhome.co.kr';
  html+='<div class="link-row"><button type="button" id="toggle-fav">'+(favorites.includes(item.id)?'★ 관심 해제':'☆ 관심 단지 저장')+'</button><a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">청약홈 공고 열기</a></div>';
  $('detail-content').innerHTML=html; openDialog('modal-backdrop');
  $('toggle-fav').addEventListener('click',()=>{
    favorites=favorites.includes(item.id)?favorites.filter(id=>id!==item.id):[...favorites,item.id];
    save(K_FAV,favorites); openDetail(item); render();
  });
}
function openDialog(id) {
  $(id).hidden=false; document.body.classList.add('dialog-open');
}
function closeDialog(id) {
  $(id).hidden=true;
  if($('modal-backdrop').hidden&&$('settings-backdrop').hidden) document.body.classList.remove('dialog-open');
}
const profileFields=['region','city','residenceSince','accountSince','homelessSince','ownsHome','marriedAt','childrenCount','deposit','depositAmountManwon','paymentCount','preferredArea','householdHead','householdHomeless','wonWithin5Years'];
function openSettings() {
  const form=$('profile-form');
  for(const key of profileFields) form.elements[key].value=profile[key]??'';
  form.elements.childBirths.value=(profile.childBirths||[]).join('\n');
  openDialog('settings-backdrop');
}
function initEvents() {
  const selectMonth=offset=>{
    monthOffset=Math.max(0,Math.min(1,offset));
    const d=new Date(Date.UTC(todayParts[0],todayParts[1]-1+monthOffset,1));
    currentYear=d.getUTCFullYear(); currentMonth=d.getUTCMonth(); render();
  };
  $('previous').addEventListener('click',()=>selectMonth(monthOffset-1));
  $('next').addEventListener('click',()=>selectMonth(monthOffset+1));
  $('this-month').addEventListener('click',()=>selectMonth(0));
  $('region-filter').addEventListener('change',e=>{region=e.target.value;render();});
  $('status-filter').addEventListener('change',e=>{statusFilter=e.target.value;render();});
  $('saved-only').addEventListener('change',e=>{savedOnly=e.target.checked;render();});
  $('settings-button').addEventListener('click',openSettings);
  $('profile-import-button').addEventListener('click',()=>$('profile-import-file').click());
  $('profile-import-file').addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file) return;
    try {
      const payload=JSON.parse(await file.text()), candidate=payload.profile||payload;
      if(!candidate||!normalizeDate(candidate.accountSince)||typeof candidate.region!=='string') throw new Error('Invalid profile');
      profile=normalizeProfile(candidate); saveProfile();
      $('profile-feedback').textContent='개인 조건을 불러왔습니다.';
      openSettings(); render();
    } catch { $('profile-feedback').textContent='청약 기본값 JSON 파일을 확인해 주세요.'; }
    e.target.value='';
  });
  $('settings-close').addEventListener('click',()=>closeDialog('settings-backdrop'));
  $('detail-close').addEventListener('click',()=>closeDialog('modal-backdrop'));
  for(const id of ['modal-backdrop','settings-backdrop']) $(id).addEventListener('click',e=>{if(e.target===$(id))closeDialog(id);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDialog('modal-backdrop');closeDialog('settings-backdrop');}});
  $('profile-reset').addEventListener('click',()=>{
    profile=normalizeProfile(DEFAULT_PROFILE); saveProfile();
    $('profile-feedback').textContent='배포된 기본값을 적용했습니다.';
    $('profile-error').textContent=''; openSettings(); render();
  });
  $('profile-form').addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget;
    const births=form.elements.childBirths.value.split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
    if(births.some(s=>!normalizeMonthOrDate(s))||(form.elements.marriedAt.value&&!normalizeMonthOrDate(form.elements.marriedAt.value))) {
      $('profile-error').textContent='혼인일과 자녀 출생일은 YYYY-MM 또는 YYYY-MM-DD로 입력해 주세요.'; return;
    }
    const input=Object.fromEntries(profileFields.map(key=>[key,form.elements[key].value.trim()]));
    profile=normalizeProfile({...profile,...input,childBirths:births}); saveProfile();
    $('profile-error').textContent=''; closeDialog('settings-backdrop'); render();
  });

}
function showBanner() {
  const box=$('data-warning');
  box.hidden=false;
  if(!data.updatedAt&&!data.items.length) {
    box.innerHTML='<strong>'+(isDemo?'체험 모드 · 가상 데이터입니다.':'공식 데이터가 아직 연결되지 않았어요.')+'</strong> '+(isDemo?'실제 청약 공고가 아닙니다.':'데이터 동기화가 완료되면 실제 공고가 나타납니다.')+' <button id="sample-toggle" type="button">'+(isDemo?'공식 데이터로 돌아가기':'가상 데이터로 미리보기')+'</button>';
    $('sample-toggle').addEventListener('click',()=>{isDemo=!isDemo;showBanner();render();});
  } else box.innerHTML='<strong>공식 공고 '+data.items.length+'건</strong> · 마지막 수집: '+(data.updatedAt?esc(new Date(data.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})):'미확인');
  $('sync-indicator').textContent=data.updatedAt||data.items.length?data.items.length+'건 동기화':'API 연결 필요';
}
async function boot() {
  const version=$('app-version');
  if(/^v\d{6}_\d{6}$/.test(version.dataset.version)) version.textContent=version.dataset.version;
  initEvents();
  try {
    const response=await fetch('data/listings.json?v='+Date.now(),{cache:'no-store'});
    if(!response.ok) throw new Error('HTTP '+response.status);
    const payload=await response.json();
    if(!Array.isArray(payload.items)) throw new Error('잘못된 데이터 형식');
    data=payload;
  } catch(error) { console.error('Unable to read official dataset',error); }
  showBanner(); render();
}
boot();
