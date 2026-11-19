/** Informational ranking; the announcement remains authoritative. */
export const DEFAULT_PROFILE = {
  region:'경기', city:'용인시', residenceSince:'', residenceMinMonths:0,
  residenceVerifiedAt:'', accountSince:'', homelessSince:'', ownsHome:'unknown',
  marriedAt:'', childBirths:[], childrenCount:0, deposit:'unknown',
  depositAmountManwon:null, paymentCount:null, profileVerifiedAt:'',
  preferredArea:84, householdHead:'unknown', householdHomeless:'unknown',
  wonWithin5Years:'unknown'
};
export const STATUS = {
  first_local:{text:'1순위 해당지역 가능',short:'1순위·해당'},
  first_other:{text:'1순위 기타지역 가능',short:'1순위·기타'},
  second:{text:'2순위 가능',short:'2순위'},
  review:{text:'검토 필요',short:'검토 필요'}
};
const CAPITAL = new Set(['서울','경기','인천']);

export function normalizeDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return '';
  const d = new Date(String(s)+'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(String(s)) ? String(s) : '';
}
export function normalizeMonthOrDate(s) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(s))) return String(s);
  return normalizeDate(s);
}
export function yearsBetween(start,end) {
  if (!normalizeDate(start)||!normalizeDate(end)||start>end) return -1;
  const a=start.split('-').map(Number), b=end.split('-').map(Number);
  return b[0]-a[0]-(b[1]<a[1]||(b[1]===a[1]&&b[2]<a[2])?1:0);
}
export function monthsBetween(start,end) {
  if (!normalizeDate(start)||!normalizeDate(end)||start>end) return -1;
  const a=start.split('-').map(Number), b=end.split('-').map(Number);
  return (b[0]-a[0])*12+b[1]-a[1]-(b[2]<a[2]?1:0);
}
export function normalizeProfile(input={}) {
  const p={...DEFAULT_PROFILE};
  if (!input || typeof input!=='object' || Array.isArray(input)) return p;
  for (const key of ['region','city']) if (typeof input[key]==='string') p[key]=input[key].trim().slice(0,50);
  for (const key of ['residenceSince','residenceVerifiedAt','accountSince','homelessSince','profileVerifiedAt']) p[key]=normalizeDate(input[key]);
  p.marriedAt=normalizeMonthOrDate(input.marriedAt);
  p.childBirths=Array.isArray(input.childBirths)?input.childBirths.map(normalizeMonthOrDate).filter(Boolean).slice(0,12):[];
  for (const key of ['ownsHome','householdHead','householdHomeless','wonWithin5Years']) {
    if (['yes','no','unknown'].includes(input[key])) p[key]=input[key];
  }
  if (['enough','not-enough','unknown'].includes(input.deposit)) p.deposit=input.deposit;
  for (const key of ['depositAmountManwon','paymentCount','childrenCount','residenceMinMonths','preferredArea']) {
    const value=input[key];
    if (value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0) p[key]=Number(value);
  }
  p.childrenCount=Math.max(p.childrenCount,p.childBirths.length);
  p.preferredArea=p.preferredArea>0&&p.preferredArea<=300?p.preferredArea:84;
  return p;
}
export function encodeProfile(profile) {
  const bytes=new TextEncoder().encode(JSON.stringify(normalizeProfile(profile)));
  return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeProfileFragment(hash) {
  try {
    const raw=new URLSearchParams(String(hash).replace(/^#/,'')).get('profile');
    if (!raw||raw.length>6000||!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
    const base=raw.replace(/-/g,'+').replace(/_/g,'/');
    const bytes=Uint8Array.from(atob(base),c=>c.charCodeAt(0));
    return normalizeProfile(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return null; }
}
export function cityFromAddress(address='') {
  const m=String(address).match(/(?:경기도|서울특별시|인천광역시)\s+([가-힣]+시|[가-힣]+군|[가-힣]+구)/);
  return m?m[1]:'';
}
export function profileReady(p) {
  return Boolean(p.region&&p.city&&normalizeDate(p.accountSince));
}
export function calendarWeeks(year,month) {
  const first=new Date(Date.UTC(year,month,1)), last=new Date(Date.UTC(year,month+1,0));
  const monday=new Date(first);
  monday.setUTCDate(1-(first.getUTCDay()+6)%7);
  const result=[];
  for(let start=new Date(monday);start<=last;start.setUTCDate(start.getUTCDate()+7)) {
    const days=Array.from({length:5},(_,i)=>{
      const d=new Date(start); d.setUTCDate(d.getUTCDate()+i);
      return {date:d.toISOString().slice(0,10),day:d.getUTCDate(),inMonth:d.getUTCMonth()===month};
    });
    if(days.some(d=>d.inMonth)) result.push(days);
  }
  return result;
}
export function chooseModel(listing,preferredArea=84) {
  const models=(listing.models||[]).filter(m=>typeof m.priceManwon==='number'&&m.priceManwon>0);
  return models.slice().sort((a,b)=>Math.abs((a.area??999)-preferredArea)-Math.abs((b.area??999)-preferredArea))[0]||null;
}
function residenceMonths(p,at) {
  if(normalizeDate(p.residenceSince)) return monthsBetween(p.residenceSince,at);
  if(p.residenceMinMonths>0&&normalizeDate(p.residenceVerifiedAt)&&at>=p.residenceVerifiedAt) {
    return p.residenceMinMonths+Math.max(0,monthsBetween(p.residenceVerifiedAt,at));
  }
  return null;
}
export function relevantRank(listing,p,rank=1) {
  const d=listing.dates||{}, at=normalizeDate(listing.announcementDate)||'';
  const prefix='GNRL_RNK'+rank+'_';
  const local=p.region===listing.region && Boolean(p.city&&cityFromAddress(listing.address)===p.city);
  const months=residenceMonths(p,at);
  const requiresTwoYears=listing.speculative===true || (listing.speculative===undefined&&listing.regulated);
  const localConfirmed=!requiresTwoYears||(months!==null&&months>=24);
  const routes=[];
  if(local&&localConfirmed) routes.push(['CRSPAREA','해당지역','local']);
  if(p.region==='경기'&&listing.region==='경기') routes.push(['ETC_GG','기타경기','other']);
  routes.push(['ETC_AREA','기타지역','other']);
  for(const [key,label,kind] of routes) {
    const when=normalizeDate(d[prefix+key+'_RCPTDE']);
    if(when) return {date:when,end:d[prefix+key+'_ENDDE'],regionLabel:label,regionKind:kind,regionUncertain:local&&!localConfirmed};
  }
  const fallback=normalizeDate(d[prefix+'CRSPAREA_RCPTDE']);
  return fallback?{date:fallback,end:d[prefix+'CRSPAREA_ENDDE'],regionLabel:'지역 확인 필요',regionKind:'unknown',regionUncertain:true}:null;
}
export function relevantFirstRank(listing,p) { return relevantRank(listing,p,1); }
function depositRequired(p,area) {
  const row=area<=85?[300,250,200]:area<=102?[600,400,300]:area<=135?[1000,700,400]:[1500,1000,500];
  if(p.region==='서울'||p.region==='부산') return row[0];
  if(['인천','대전','광주','대구','울산'].includes(p.region)) return row[1];
  return p.region==='경기'?row[2]:null;
}
function result(status,notes,checks=[],extra={}) {
  return {status,text:STATUS[status].text,short:STATUS[status].short,notes,checks,...extra};
}
export function assessGeneral(listing,p) {
  p=normalizeProfile(p);
  const at=normalizeDate(listing.announcementDate);
  const notes=[], checks=[];
  const first=relevantRank(listing,p,1);
  const add=(label,value,state)=>checks.push({label,value,state});
  if(!profileReady(p)||!at) return result('review',['통장 가입일과 거주지를 먼저 확인해 주세요.'],checks);
  if(p.accountSince>at) return result('review',['모집공고일 이후 통장 가입으로 표시돼 있습니다. 가입일과 신청 가능 여부를 확인하세요.'],checks);
  const sameSupplyArea=p.region===listing.region||(CAPITAL.has(p.region)&&CAPITAL.has(listing.region));
  add('신청 지역',first?.regionLabel||'접수일 확인 필요',sameSupplyArea&&!first?.regionUncertain?'pass':'review');
  if(!sameSupplyArea) notes.push('현재 거주지 밖의 공급지역입니다. 전국 청약 허용 여부를 모집공고문으로 확인해야 합니다.');
  const age=monthsBetween(p.accountSince,at), baseMonths=listing.regulated?24:CAPITAL.has(listing.region)?12:6;
  let failed=age<baseMonths, uncertain=false;
  add('통장 가입기간',age+'개월 / 기준 '+baseMonths+'개월',failed?'fail':'pass');
  if(!listing.regulated&&age>=baseMonths&&age<(CAPITAL.has(listing.region)?24:12)) {
    uncertain=true; notes.push('지자체가 1순위 가입기간을 연장했는지 확인이 필요합니다.');
  }
  const publicHousing=listing.publicHousing||listing.housingType==='국민';
  if(publicHousing) {
    const count=listing.regulated?24:CAPITAL.has(listing.region)?12:6;
    const paid=Number.isFinite(p.paymentCount)?p.paymentCount:null;
    add('납입인정 횟수',paid===null?'미확인':paid+'회 / 기준 '+count+'회',paid===null?'review':paid>=count?'pass':'fail');
    if(paid===null) uncertain=true; else if(paid<count) failed=true;
    if(!listing.regulated&&paid!==null&&paid>=count&&paid<(CAPITAL.has(listing.region)?24:12)) uncertain=true;
    add('무주택 세대 요건',p.householdHomeless==='yes'?'확인됨':'확인 필요',p.householdHomeless==='yes'?'pass':'review');
    uncertain=uncertain||p.householdHomeless!=='yes';
    notes.push('국민·공공주택의 무주택 세대, 소득·자산 및 공급 단계별 자격은 공고문 검토가 필요합니다.');
    uncertain=true;
  } else {
    const model=chooseModel(listing,p.preferredArea||84), area=model?.area||p.preferredArea||84;
    const needed=depositRequired(p,area), amount=Number.isFinite(p.depositAmountManwon)?p.depositAmountManwon:null;
    const enough=p.deposit==='not-enough'?false:p.deposit==='enough'?true:needed!==null&&amount!==null?amount>=needed:null;
    add('예치금',amount!==null&&needed!==null?amount+'만원 / '+area+'㎡ 기준 '+needed+'만원':enough===true?'충족으로 입력':enough===false?'미충족으로 입력':'확인 필요',enough===null?'review':enough?'pass':'fail');
    if(enough===false) failed=true;
    if(enough===null) uncertain=true;
    if(amount!==null) notes.push('예치금은 입력한 통장 금액 기준입니다. 다른 면적을 신청하거나 잔액이 달라지면 다시 확인하세요.');
    if(p.ownsHome==='unknown') uncertain=true;
  }
  if(listing.regulated) {
    add('세대주',p.householdHead==='yes'?'확인됨':p.householdHead==='no'?'세대주 아님':'미확인',p.householdHead==='yes'?'pass':p.householdHead==='no'?'fail':'review');
    add('최근 5년 세대 당첨',p.wonWithin5Years==='no'?'없음':p.wonWithin5Years==='yes'?'이력 있음':'미확인',p.wonWithin5Years==='no'?'pass':p.wonWithin5Years==='yes'?'fail':'review');
    if(p.householdHead==='no'||p.wonWithin5Years==='yes') failed=true;
    if(p.householdHead==='unknown'||p.wonWithin5Years==='unknown') uncertain=true;
    notes.push('규제지역의 세대주·최근 5년 세대 당첨 여부와 주택 수 제한을 확인해야 합니다.');
  }
  if(listing.regulated||listing.publicDistrict) {
    add('세대 내 주택 수',p.householdHomeless==='yes'?'전원 무주택 확인':'확인 필요',p.householdHomeless==='yes'?'pass':'review');
    if(p.householdHomeless!=='yes') uncertain=true;
  }
  if(p.ownsHome==='yes') {
    uncertain=true; notes.push('유주택 세대의 주택 수와 공급유형별 제한은 공고문으로 확인해야 합니다.');
  }
  notes.push('가능 표시는 일반공급 순위의 예비 분류입니다. 재당첨 제한·세대원 자격·공고별 거주 제한을 최종 확인하세요.');
  if(!sameSupplyArea||first?.regionUncertain||!first) return result('review',notes,checks,{rankCandidate:failed?'second':'first'});
  if(failed&&!publicHousing) {
    const second=relevantRank(listing,p,2);
    if(second&&!second.regionUncertain) return result('second',['1순위 기본 요건 중 미충족 항목이 있어 2순위 접수일로 표시합니다.',...notes],checks);
    return result('review',['1순위 요건 미충족입니다. API에 적용 가능한 2순위 일정이 없어 공고 확인이 필요합니다.',...notes],checks,{rankCandidate:'second'});
  }
  if(uncertain||failed) return result('review',notes,checks,{rankCandidate:failed?'second':'first'});
  return result(first.regionKind==='local'?'first_local':'first_other',notes,checks);
}
export function eventsFor(listing,p) {
  const events=[], d=listing.dates||{};
  if(listing.category==='remaining') {
    const date=d.SUBSCRPT_RCEPT_BGNDE||d.GNRL_RCEPT_BGNDE||d.RCEPT_BGNDE||d.SPSPLY_RCEPT_BGNDE;
    if(normalizeDate(date)) events.push({kind:'remaining',label:'무순위',date,end:d.SUBSCRPT_RCEPT_ENDDE||d.GNRL_RCEPT_ENDDE||d.RCEPT_ENDDE,regionLabel:'공고 확인'});
  } else {
    if(normalizeDate(d.SPSPLY_RCEPT_BGNDE)) events.push({kind:'special',label:'특별공급',date:d.SPSPLY_RCEPT_BGNDE,end:d.SPSPLY_RCEPT_ENDDE,regionLabel:'전체'});
    const assessment=assessGeneral(listing,p), rank=assessment.status==='second'?2:1;
    const schedule=relevantRank(listing,p,rank);
    if(schedule) events.push({kind:rank===2?'general2':'general',label:'일반 '+rank+'순위',...schedule});
    if(!schedule&&normalizeDate(d.RCEPT_BGNDE)) events.push({kind:'general',label:'청약접수',date:d.RCEPT_BGNDE,end:d.RCEPT_ENDDE,regionLabel:'공고 확인'});
  }
  if(!events.length&&normalizeDate(listing.announcementDate)) events.push({kind:'notice',label:'모집공고',date:listing.announcementDate,regionLabel:'공고 확인'});
  return events.map(e=>({...e,id:listing.id+':'+e.kind+':'+e.date,listing}));
}
function monthRange(s,at) {
  if(normalizeDate(s)) return [monthsBetween(s,at),monthsBetween(s,at)];
  if(!normalizeMonthOrDate(s)) return null;
  const parts=s.split('-').map(Number), last=new Date(Date.UTC(parts[0],parts[1],0)).getUTCDate();
  return [monthsBetween(s+'-'+String(last).padStart(2,'0'),at),monthsBetween(s+'-01',at)];
}
export function assess(event,p) {
  if(event.kind==='general'||event.kind==='general2') return assessGeneral(event.listing,p);
  if(event.kind==='remaining') return result('review',['무순위·잔여세대는 거주지·무주택·재당첨 조건을 공고별로 확인해야 합니다.'],[],{text:'무순위 · 검토 필요',short:'무순위·검토'});
  if(event.kind==='notice') return result('review',['접수일이 제공되지 않아 모집공고일에 표시했습니다.'],[],{text:'모집공고 · 검토 필요',short:'공고 확인'});
  const at=normalizeDate(event.listing.announcementDate)||event.date, notes=[];
  if((p.childrenCount||p.childBirths?.length||0)>=2) notes.push('자녀 2명 이상: 다자녀 특별공급의 세부 기준을 검토할 수 있습니다.');
  for(const birth of p.childBirths||[]) {
    const range=monthRange(birth,at);
    if(range&&range[0]>=0&&range[1]<24) notes.push('공고일 기준 만 24개월 미만 자녀: 신생아 공급의 주택유형·소득 기준을 확인하세요.');
    else if(range&&range[0]<24&&range[1]>=24) notes.push('자녀 출생월만 확인되어 만 24개월 경계의 정확한 출생일 확인이 필요합니다.');
  }
  const marriage=monthRange(p.marriedAt,at);
  if(marriage&&marriage[0]>=84) notes.push('입력한 혼인기간은 7년 이상입니다. 혼인 7년 이내를 요구하는 신혼부부 유형은 별도로 구분하세요.');
  notes.push('특별공급은 유형별 소득·자산·무주택·지역 배정과 중복 신청 조건을 공고문으로 검토해야 합니다.');
  return result('review',notes,[],{text:'특별공급 · 검토 필요',short:'특공·검토'});
}
