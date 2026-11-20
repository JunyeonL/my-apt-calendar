import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDate,normalizeMonthOrDate,monthsBetween,yearsBetween,eventsFor,assess,assessGeneral,chooseModel,relevantFirstRank,normalizeProfile,encodeProfile,decodeProfileFragment,calendarWeeks,EMPTY_PROFILE,DEFAULT_PROFILE,resolveProfile,profileOverrides,assessSpecial,compareCalendarEvents,onCalendarDay} from '../eligibility.mjs';

test('first visit and reset take the editable deployment defaults',()=>{
  assert.deepEqual(resolveProfile(),DEFAULT_PROFILE);
  assert.deepEqual(resolveProfile({overrides:{}}),DEFAULT_PROFILE);
  const birthDates=[...DEFAULT_PROFILE.childBirths];
  resolveProfile().childBirths.push('2020-01');
  assert.deepEqual(DEFAULT_PROFILE.childBirths,birthDates);
});
test('stale saved defaults adopt the published corrections and keep other edits',()=>{
  const old={...EMPTY_PROFILE,marriedAt:'2015-01',childBirths:['2021-02'],householdHead:'yes'};
  const migrated=resolveProfile({oldBaseline:old,oldProfile:{...old,city:'수원시',childBirths:['2018-01']}});
  assert.deepEqual(migrated,{...DEFAULT_PROFILE,city:'수원시'});
  assert.deepEqual(profileOverrides(migrated),{city:'수원시'});
  assert.deepEqual(resolveProfile({oldProfile:EMPTY_PROFILE}),DEFAULT_PROFILE);
});
test('explicit edits, including clearing a field, survive reload until reset',()=>{
  const edited={...DEFAULT_PROFILE,accountSince:'',householdHead:'unknown'};
  assert.deepEqual(resolveProfile({overrides:profileOverrides(edited)}),edited);
  assert.deepEqual(resolveProfile({overrides:{},oldProfile:edited}),DEFAULT_PROFILE);
});

const basic=normalizeProfile({region:'경기',city:'용인시',accountSince:'2010-01-01',ownsHome:'no',depositAmountManwon:350,paymentCount:100,childrenCount:2,childBirths:['2025-03'],marriedAt:'2019-04'});
const apt={id:'apt-test',category:'apt',name:'테스트 단지',region:'경기',address:'경기도 용인시 수지구',housingType:'민영',announcementDate:'2026-11-02',regulated:false,speculative:false,models:[{type:'059',area:59,priceManwon:60000},{type:'084',area:84,priceManwon:100000}],dates:{SPSPLY_RCEPT_BGNDE:'2026-11-16',GNRL_RNK1_CRSPAREA_RCPTDE:'2026-11-17',GNRL_RNK1_ETC_GG_RCPTDE:'2026-11-18',GNRL_RNK1_ETC_AREA_RCPTDE:'2026-11-19',GNRL_RNK2_CRSPAREA_RCPTDE:'2026-11-20',GNRL_RNK2_ETC_GG_RCPTDE:'2026-11-23',GNRL_RNK2_ETC_AREA_RCPTDE:'2026-11-24'}};

test('date helpers validate calendar dates and preserve month precision',()=>{
  assert.equal(normalizeDate('2026-02-30'),'');
  assert.equal(normalizeDate('2026-02-28'),'2026-02-28');
  assert.equal(normalizeMonthOrDate('2025-03'),'2025-03');
  assert.equal(normalizeMonthOrDate('2025-13'),'');
  assert.equal(monthsBetween('2025-03-15','2027-03-14'),23);
  assert.equal(yearsBetween('2019-04-01','2026-11-02'),7);
});
test('private profile import keeps only supported values without inventing dates',()=>{
  const source={...basic,marriedAt:'2019-04',childBirths:['2025-03'],residenceSince:'',income:123456,script:'<script>'};
  const restored=decodeProfileFragment('#profile='+encodeProfile(source));
  assert.equal(restored.marriedAt,'2019-04');
  assert.deepEqual(restored.childBirths,['2025-03']);
  assert.equal(restored.residenceSince,'');
  assert.equal(restored.childrenCount,2);
  assert.equal('income' in restored,false);
  assert.equal('script' in restored,false);
  assert.equal(decodeProfileFragment('#profile=bad!!!'),null);
  assert.equal(decodeProfileFragment('#profile='+Buffer.from('{bad json').toString('base64url')),null);
});
test('weekday calendar covers every Monday to Friday once in all months',()=>{
  for(let month=0;month<12;month++) {
    const weeks=calendarWeeks(2026,month), actual=weeks.flat().filter(d=>d.inMonth).map(d=>d.date);
    const expected=[];
    for(let day=1;day<=31;day++) {
      const d=new Date(Date.UTC(2026,month,day));
      if(d.getUTCMonth()!==month) break;
      if(![0,6].includes(d.getUTCDay())) expected.push(d.toISOString().slice(0,10));
    }
    assert.deepEqual(actual,expected);
    assert.ok(weeks.every(w=>w.length===5&&w.some(d=>d.inMonth)));
    assert.ok(weeks.flat().every(d=>![0,6].includes(new Date(d.date+'T00:00:00Z').getUTCDay())));
  }
  assert.equal(calendarWeeks(2026,10)[0][0].date,'2026-11-02');
});
test('same city with sufficient ordinary criteria is first rank local',()=>{
  assert.equal(relevantFirstRank(apt,basic).date,'2026-11-17');
  assert.equal(assessGeneral(apt,basic).status,'first_local');
  assert.equal(assessGeneral(apt,basic).text,'1순위 해당지역 가능');
});
test('other Gyeonggi and other capital area use their actual first rank dates',()=>{
  const other={...basic,city:'수원시'};
  assert.equal(relevantFirstRank(apt,other).date,'2026-11-18');
  assert.equal(relevantFirstRank(apt,other).regionLabel,'기타경기');
  assert.equal(assessGeneral(apt,other).status,'first_other');
  const seoul={...basic,region:'서울',city:'강남구'};
  assert.equal(relevantFirstRank(apt,seoul).date,'2026-11-19');
  assert.equal(assessGeneral(apt,seoul).status,'first_other');
});
test('local-only API dates cannot be presented as confirmed other-area dates',()=>{
  const localOnly={...apt,dates:{GNRL_RNK1_CRSPAREA_RCPTDE:'2026-11-17'}};
  assert.equal(assessGeneral(localOnly,{...basic,city:'수원시'}).status,'review');
});
test('unknown eligibility in a different noncapital supply area stays review',()=>{
  assert.equal(assessGeneral({...apt,region:'부산',address:'부산광역시 해운대구'},basic).status,'review');
});
test('known first rank shortfall chooses second rank receipt day',()=>{
  const recent={...basic,accountSince:'2026-10-01'};
  const a=assessGeneral(apt,recent);
  assert.equal(a.status,'second');
  const e=eventsFor(apt,recent).find(e=>e.kind==='general2');
  assert.equal(e.date,'2026-11-20');
  assert.ok(!eventsFor(apt,recent).some(e=>e.kind==='general'));
});
test('insufficient deposit can be second rank and explicit confirmation wins',()=>{
  const p={...basic,deposit:'not-enough'};
  assert.equal(assessGeneral(apt,p).status,'second');
  assert.equal(assessGeneral(apt,{...basic,depositAmountManwon:100}).status,'second');
});
test('missing second rank date stays review instead of using first rank day',()=>{
  const item={...apt,dates:{GNRL_RNK1_CRSPAREA_RCPTDE:'2026-11-17'}};
  const a=assessGeneral(item,{...basic,depositAmountManwon:100});
  assert.equal(a.status,'review');
  assert.equal(a.rankCandidate,'second');
});
test('regulated unknown household and win history remains review with reasons',()=>{
  const item={...apt,regulated:true,speculative:true};
  const p={...basic,residenceSince:'2020-01-01'};
  const a=assessGeneral(item,p);
  assert.equal(a.status,'review');
  assert.ok(a.checks.some(c=>c.label==='통장 가입기간'&&c.state==='pass'));
  assert.ok(a.checks.some(c=>c.label==='세대주'&&c.state==='review'));
  assert.ok(a.checks.some(c=>c.label==='최근 5년 세대 당첨'&&c.state==='review'));
});
test('regulated verified first rank and local residency can pass',()=>{
  const item={...apt,regulated:true,speculative:true};
  const p={...basic,residenceSince:'2024-11-02',householdHead:'yes',householdHomeless:'yes',wonWithin5Years:'no'};
  assert.equal(assessGeneral(item,p).status,'first_local');
  assert.equal(assessGeneral(item,{...p,residenceSince:'2024-11-03'}).status,'review');
});
test('uncertain or short local residency is not labelled local first rank',()=>{
  const item={...apt,regulated:true,speculative:true};
  const p={...basic,residenceSince:'2026-01-01',householdHead:'yes',householdHomeless:'yes',wonWithin5Years:'no'};
  assert.equal(assessGeneral(item,p).status,'review');
  assert.notEqual(relevantFirstRank(item,p).regionKind,'local');
});
test('public housing keeps extra qualification review visible',()=>{
  const a=assessGeneral({...apt,publicHousing:true,housingType:'국민'},basic);
  assert.equal(a.status,'review');
  assert.ok(a.checks.some(c=>c.label==='납입인정 횟수'&&c.state==='pass'));
  assert.ok(a.notes.some(n=>n.includes('소득·자산')));
});
const family={...basic,childBirths:['2022-01-17','2025-02-10'],householdHead:'no',householdHomeless:'yes',wonWithin5Years:'no'};
const special=(changes={})=>({...apt,models:[{type:'084A',area:84,specialSupply:7,specialBreakdown:{multiChild:2,newborn:3,newlywed:2}}],...changes});
test('regulated private multi-child allocations do not require a household head, newborn first rank does',()=>{
  const a=assessSpecial(special({regulated:true}),family);
  assert.deepEqual(a.candidates,['다자녀']);
  assert.match(a.checks.find(c=>c.label==='신생아').value,/세대주/);
  assert.equal(assessSpecial(special({region:'부산'}),family).status,'review');
  assert.equal(assessSpecial(special(),{...family,householdHomeless:'unknown'}).status,'review');
});
test('public-sale newborn includes the second birthday and applies its own savings rules',()=>{
  const onBirthday=special({announcementDate:'2027-02-10',publicHousingLaw:true,housingType:'국민',regulated:true});
  const accepted=assessSpecial(onBirthday,family);
  assert.deepEqual(accepted.candidates,['다자녀','신생아','신혼부부']);
  assert.ok(!assessSpecial({...onBirthday,announcementDate:'2027-02-11'},family).candidates.includes('신생아'));
  assert.ok(!assessSpecial(onBirthday,{...family,paymentCount:5}).candidates.length);
  const unknown=assessSpecial(onBirthday,{...family,childBirths:['2025-02']});
  assert.equal(unknown.checks.find(c=>c.label==='신생아').state,'review');
});
test('an adult child and undisclosed birthdays cannot confirm two minors',()=>{
  const a=assessSpecial(special(),{...family,childBirths:['2007-11-02','2025-01-01']});
  assert.ok(!a.candidates.includes('다자녀'));
  const unknown=assessSpecial(special(),{...family,childBirths:['2025-01']});
  assert.equal(unknown.checks[0].state,'review');
});
test('distinguishes zero from missing quota and checks the deposit for the actual allocated type',()=>{
  const item=special({models:[
    {area:84,specialBreakdown:{multiChild:0,newborn:0}},
    {area:140,specialBreakdown:{multiChild:3,newborn:0}}
  ]});
  let a=assessSpecial(item,{...family,marriedAt:'2024-05-01',depositAmountManwon:250});
  assert.equal(a.status,'review');
  assert.match(a.checks[0].value,/예치금 미달/);
  assert.equal(a.checks[1].value,'배정 없음');
  assert.equal(a.checks[2].state,'review');
  a=assessSpecial(item,{...family,depositAmountManwon:500});
  assert.deepEqual(a.candidates,['다자녀']);
});
test('a calendar day includes ongoing receipts and orders by the assessed status then name',()=>{
  const statuses=['review','first_other','second','special','first_local'];
  const events=statuses.map(status=>({id:status,listing:apt,assessment:{status}}));
  assert.deepEqual(events.sort(compareCalendarEvents).map(e=>e.id),['special','first_local','first_other','second','review']);
  assert.equal(onCalendarDay({date:'2026-12-30',end:'2027-01-04'},'2027-01-04'),true);
  assert.equal(onCalendarDay({date:'2026-12-30'},'2026-12-31'),false);
});
test('remaining supply is never automatically labelled first rank',()=>{
  const item={...apt,category:'remaining',dates:{GNRL_RCEPT_BGNDE:'2026-11-20'}};
  const e=eventsFor(item,basic);
  assert.equal(e[0].date,'2026-11-20');
  assert.equal(assess(e[0],basic).status,'review');
});
test('select model by preferred exclusive area',()=>{
  assert.equal(chooseModel(apt,84).type,'084');
  assert.equal(chooseModel(apt,59).type,'059');
});
