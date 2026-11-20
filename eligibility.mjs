/** Informational ranking; the announcement remains authoritative. */
export const EMPTY_PROFILE = {
  region:'경기', city:'용인시', residenceSince:'',
  accountSince:'', homelessSince:'', ownsHome:'unknown',
  marriedAt:'', childBirths:[], childrenCount:0, deposit:'unknown',
  depositAmountManwon:null, paymentCount:null, profileVerifiedAt:'',
  preferredArea:84, householdHead:'unknown', householdHomeless:'unknown',
  wonWithin5Years:'unknown'
};
// Owner-approved defaults for this personal calendar.
export const DEFAULT_PROFILE = {
  ...EMPTY_PROFILE,
  "region": "경기",
  "city": "용인시",
  "residenceSince": "2023-11-20",
  "accountSince": "2016-10-07",
  "homelessSince": "2025-10-17",
  "ownsHome": "no",
  "marriedAt": "2019-02-17",
  "childBirths": [
    "2022-02-19", "2025-02-10"
  ],
  "childrenCount": 2,
  "deposit": "unknown",
  "depositAmountManwon": 418,
  "paymentCount": 121,
  "profileVerifiedAt": "2026-11-04",
  "preferredArea": 84,
  "householdHead": "no",
  "householdHomeless": "yes",
  "wonWithin5Years": "no"
};
export const STATUS = {
  special:{text:'특공 후보',short:'특공 후보'},
  first_local:{text:'1순위 해당지역 가능',short:'1·해당'},
  first_other:{text:'1순위 기타지역 가능',short:'1·기타'},
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
  const p={...EMPTY_PROFILE,childBirths:[]};
  if (!input || typeof input!=='object' || Array.isArray(input)) return p;
  for (const key of ['region','city']) if (typeof input[key]==='string') p[key]=input[key].trim().slice(0,50);
  for (const key of ['residenceSince','accountSince','homelessSince','profileVerifiedAt']) p[key]=normalizeDate(input[key]);
  p.marriedAt=normalizeMonthOrDate(input.marriedAt);
  p.childBirths=Array.isArray(input.childBirths)?input.childBirths.map(normalizeMonthOrDate).filter(Boolean).slice(0,12):[];
  for (const key of ['ownsHome','householdHead','householdHomeless','wonWithin5Years']) {
    if (['yes','no','unknown'].includes(input[key])) p[key]=input[key];
  }
  if (['enough','not-enough','unknown'].includes(input.deposit)) p.deposit=input.deposit;
  for (const key of ['depositAmountManwon','paymentCount','childrenCount','preferredArea']) {
    const value=input[key];
    if (value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0) p[key]=Number(value);
  }
  p.childrenCount=Math.max(p.childrenCount,p.childBirths.length);
  p.preferredArea=p.preferredArea>0&&p.preferredArea<=300?p.preferredArea:84;
  return p;
}
export function profileOverrides(profile, defaults=DEFAULT_PROFILE) {
  const base=normalizeProfile(defaults);
  return Object.fromEntries(Object.entries(normalizeProfile(profile))
    .filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(base[key])));
}
export function resolveProfile({overrides,oldProfile,oldBaseline}={}) {
  if(!overrides || typeof overrides!=='object' || Array.isArray(overrides)) {
    // Earlier versions saved a full copy of both the defaults and the edited form.
    // Reapply the owner's corrections once, and keep unrelated local edits.
    overrides=oldProfile?profileOverrides(oldProfile,oldBaseline||EMPTY_PROFILE):{};
    for(const key of ['residenceSince','householdHead','householdHomeless','wonWithin5Years','childBirths','childrenCount']) {
      delete overrides[key];
    }
  }
  return normalizeProfile({...DEFAULT_PROFILE,...overrides});
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
export function relevantRank(listing,p,rank=1) {
  const d=listing.dates||{}, at=normalizeDate(listing.announcementDate)||'';
  const prefix='GNRL_RNK'+rank+'_';
  const local=p.region===listing.region && Boolean(p.city&&cityFromAddress(listing.address)===p.city);
  const months=monthsBetween(p.residenceSince,at);
  const requiresTwoYears=listing.speculative===true || (listing.speculative===undefined&&listing.regulated);
  const localConfirmed=!requiresTwoYears||months>=24;
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
  if(!Number.isFinite(area)||area<=0) return null;
  const row=area<=85?[300,250,200]:area<=102?[600,400,300]:area<=135?[1000,700,400]:[1500,1000,500];
  if(p.region==='서울'||p.region==='부산') return row[0];
  if(['인천','대전','광주','대구','울산'].includes(p.region)) return row[1];
  return p.region==='경기'?row[2]:null;
}
function depositEnough(p,area) {
  const needed=depositRequired(p,area);
  if(needed===null) return null;
  if(needed===depositRequired(p,p.preferredArea)&&p.deposit!=='unknown') return p.deposit==='enough';
  return Number.isFinite(p.depositAmountManwon)?p.depositAmountManwon>=needed:null;
}
function sameSupplyArea(listing,p) {
  return Boolean(p.region&&listing.region&&(p.region===listing.region||(CAPITAL.has(p.region)&&CAPITAL.has(listing.region))));
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
  const inArea=sameSupplyArea(listing,p);
  add('신청 지역',first?.regionLabel||'접수일 확인 필요',inArea&&!first?.regionUncertain?'pass':'review');
  if(!inArea) notes.push('현재 거주지 밖의 공급지역입니다. 전국 청약 허용 여부를 모집공고문으로 확인해야 합니다.');
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
    const enough=depositEnough(p,area);
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
  if(!inArea||first?.regionUncertain||!first) return result('review',notes,checks,{rankCandidate:failed?'second':'first'});
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
// A month-only birth or marriage date is a range. At an age boundary it
// remains unknown until the exact day is supplied.
function withinYears(start, at, years, inclusive=false) {
  if(!normalizeMonthOrDate(start)||!normalizeDate(at)) return null;
  const [year,month]=start.split('-').map(Number);
  const lastDay=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
  const first=start.length===7?start+'-01':start;
  const last=start.length===7?start+'-'+lastDay(year,month):start;
  const expires=date=>{
    const day=Math.min(Number(date.slice(8)),lastDay(year+years,month));
    return String(year+years)+date.slice(4,8)+String(day).padStart(2,'0');
  };
  const expired=date=>inclusive?at>expires(date):at>=expires(date);
  if(at<first||expired(last)) return false;
  return at>=last&&!expired(first)?true:null;
}

function childrenWithin(p, at, years, required, inclusive=false) {
  const ages=p.childBirths.map(birth=>withinYears(birth,at,years,inclusive));
  const matches=ages.filter(age=>age===true).length;
  if(matches>=required) return true;
  const unknown=p.childrenCount-ages.length+ages.filter(age=>age===null).length;
  return matches+unknown>=required?null:false;
}

// Evaluate actual allocations per model. A deposit for a different size or an
// undisclosed quota must not turn a listing into a special-supply candidate.
function allocationCheck(listing,p,key) {
  const models=listing.models||[];
  const savingsByCount=listing.housingType==='국민'||listing.publicHousingLaw===true;
  const usable=[], offered=[];
  let incomplete=!models.length;
  for(const model of models) {
    const quota=model.specialBreakdown?.[key];
    if(quota===0||model.specialSupply===0) continue;
    if(listing.housingType==='민영'&&key!=='multiChild'&&model.area>85) continue;
    if(!Number.isFinite(quota)) { incomplete=true; continue; }
    offered.push(model);
    const sufficient=savingsByCount?true:depositEnough(p,model.area);
    if(sufficient===null) incomplete=true;
    if(sufficient===true) usable.push(model);
  }
  if(usable.length) {
    const types=usable.map(m=>String(m.type||m.area||'미상').replace(/^0+(?=\d)/,''));
    return [true,types.join(', ')+'형'];
  }
  if(incomplete) return [null,'주택형별 배정·예치금 확인'];
  return [false,offered.length?'배정 주택형의 예치금 미달':'배정 없음'];
}

function newbornRankChecks(listing,p,at) {
  if(listing.publicHousingLaw===true) return [];
  // Public Housing Special Act sales use the public-sale savings requirement.
  // For other national/private sales the newborn route also requires first rank.
  if(listing.housingType==='국민'&&listing.publicHousingLaw!==false) return [[null,'공공주택 특별법 적용 여부 확인']];
  const capital=CAPITAL.has(listing.region);
  const minimum=listing.regulated?24:capital?12:6;
  const extended=capital?24:12;
  const savings=monthsBetween(p.accountSince,at);
  const period=value=>{
    if(value===null||value===undefined) return null;
    if(value<minimum) return false;
    return listing.regulated||value>=extended?true:null;
  };
  const checks=[[period(p.accountSince?savings:null),'신생아 특공 1순위 통장 기간']];
  if(listing.housingType==='국민') checks.push([period(p.paymentCount),'1순위 납입 횟수']);
  if(listing.regulated) {
    checks.push([p.householdHead==='unknown'?null:p.householdHead==='yes','규제지역 1순위 세대주 요건'],
      [p.wonWithin5Years==='unknown'?null:p.wonWithin5Years==='no','최근 5년 세대 당첨 이력']);
  }
  return checks;
}

export function assessSpecial(listing,input) {
  const p=normalizeProfile(input), at=normalizeDate(listing.announcementDate);
  const publicSale=listing.publicHousingLaw===true;
  const countSavings=publicSale||listing.housingType==='국민';
  const homeless=p.householdHomeless==='yes'&&p.ownsHome!=='yes';
  const knownOwner=p.householdHomeless==='no'||p.ownsHome==='yes'||Boolean(at&&p.homelessSince&&p.homelessSince>at);
  const common=[
    [at?true:null,'모집공고일 확인'],
    [sameSupplyArea(listing,p)?true:null,'거주지의 공급권역 확인'],
    [knownOwner?false:homeless?true:null,'공고일 무주택 세대 요건'],
    [at&&p.accountSince?monthsBetween(p.accountSince,at)>=6:null,'청약통장 6개월 요건'],
    [publicSale||['민영','국민'].includes(listing.housingType)?true:null,'주택유형 확인']
  ];
  if(countSavings) common.push([p.paymentCount==null?null:p.paymentCount>=6,'납입 6회 요건']);
  if(listing.houseCategory&&listing.houseCategory!=='APT') common.push([null,'별도 공급유형 자격 확인']);

  const marriage=withinYears(p.marriedAt,at,7,true);
  const youngChild=childrenWithin(p,at,7,1);
  let newlywed=marriage;
  if(marriage!==true&&youngChild!==false) {
    if(publicSale&&p.marriedAt&&at&&p.marriedAt<=at&&youngChild===true) newlywed=true;
    else if(publicSale||(listing.housingType==='국민'&&listing.publicHousingLaw!==false)) newlywed=null;
  }
  const routes=[
    ['multiChild','다자녀',childrenWithin(p,at,19,2),'미성년 자녀 2명 요건'],
    ['newborn','신생아',childrenWithin(p,at,2,1,true),'두 번째 생일까지의 자녀 요건'],
    ['newlywed','신혼부부',newlywed,publicSale?'혼인기간·자녀 연령 요건':'혼인기간 7년 요건']
  ];
  const checks=routes.map(([key,label,family,familyRule])=>{
    const allocation=allocationCheck(listing,p,key);
    const rules=[allocation,...common,[family,familyRule]];
    if(key==='newborn') rules.push(...newbornRankChecks(listing,p,at));
    const failed=rules.find(([ok])=>ok===false);
    if(failed) return {label,state:'fail',value:failed[1]==='배정 없음'?'배정 없음':'미충족 · '+failed[1]};
    const missing=rules.filter(([ok])=>ok===null);
    if(missing.length) return {label,state:'review',value:'확인 필요 · '+missing.map(([,why])=>why).join(', ')};
    return {label,state:'pass',value:'기본조건 충족 · '+allocation[1]};
  });
  const candidates=checks.filter(c=>c.state==='pass').map(c=>c.label);
  const notes=['다자녀·신생아·신혼부부를 모집공고일 기준으로 확인합니다. 소득·자산, 과거 특별공급 당첨·예외, 지역별 배정은 자동 판정 범위 밖입니다.'];
  if(candidates.length) return result('special',notes,checks,{text:'특공 후보 · '+candidates.join(' / '),candidates});
  const pending=checks.some(c=>c.state==='review');
  return result('review',notes,checks,{text:pending?'특공 확인 필요':'관심 특공 3유형 해당 없음',short:pending?'특공 검토':'특공 해당없음',candidates});
}

const priority=['special','first_local','first_other','second','review'];
const koreanOrder=new Intl.Collator('ko',{numeric:true});
export function compareCalendarEvents(a,b) {
  return priority.indexOf(a.assessment.status)-priority.indexOf(b.assessment.status)
    ||koreanOrder.compare(a.listing.name,b.listing.name)||a.id.localeCompare(b.id);
}
export function onCalendarDay(event,date) {
  return event.date<=date&&date<=(event.end>=event.date?event.end:event.date);
}

export function assess(event,p) {
  if(event.kind==='general'||event.kind==='general2') return assessGeneral(event.listing,p);
  if(event.kind==='remaining') return result('review',['무순위·잔여세대는 거주지·무주택·재당첨 조건을 공고별로 확인해야 합니다.'],[],{text:'무순위 · 검토 필요',short:'무순위'});
  if(event.kind==='notice') return result('review',['접수일이 제공되지 않아 모집공고일에 표시했습니다.'],[],{text:'모집공고 · 검토 필요',short:'공고'});
  return assessSpecial(event.listing,p);
}
