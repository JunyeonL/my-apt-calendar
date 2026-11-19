import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDate,monthsBetween,yearsBetween,eventsFor,assess,chooseModel,relevantFirstRank} from '../eligibility.mjs';
const basic={region:'경기',city:'용인시',accountSince:'2016-10-07',ownsHome:'no',deposit:'enough',childBirths:['2025-02-15'],marriedAt:'2019-02-01'};
const apt={id:'apt-1',category:'apt',name:'테스트',region:'경기',address:'경기도 용인시 수지구',announcementDate:'2026-11-02',models:[{type:'059',area:59,priceManwon:60000},{type:'084',area:84,priceManwon:100000}],dates:{SPSPLY_RCEPT_BGNDE:'2026-11-20',GNRL_RNK1_CRSPAREA_RCPTDE:'2026-11-21',GNRL_RNK1_ETC_GG_RCPTDE:'2026-11-22',GNRL_RNK1_ETC_AREA_RCPTDE:'2026-11-23'}};
test('date helpers reject invalid dates and handle months',()=>{
 assert.equal(normalizeDate('2026-02-30'),'');assert.equal(normalizeDate('2026-02-28'),'2026-02-28');
 assert.equal(monthsBetween('2025-02-15','2027-02-14'),23);
 assert.equal(monthsBetween('2025-02-15','2027-02-15'),24);
 assert.equal(yearsBetween('2019-02-01','2026-11-02'),7);
});
test('resident city selects local first rank date',()=>{
 assert.equal(relevantFirstRank(apt,basic).date,'2026-11-21');
 assert.equal(relevantFirstRank(apt,{...basic,city:'수원시'}).date,'2026-11-22');
 assert.equal(relevantFirstRank(apt,{...basic,region:'서울',city:'강남구'}).date,'2026-11-23');
});
test('special stays review; general may satisfy basic checks',()=>{
 const e=eventsFor(apt,basic);
 assert.equal(e.length,2);
 assert.equal(assess(e[0],basic).status,'review');
 assert.equal(assess(e[1],basic).status,'possible');
 assert.equal(assess(e[1],{...basic,deposit:'not-enough'}).status,'review');
 assert.equal(assess(e[1],{...basic,accountSince:'2026-12-01'}).status,'no');
});
test('remaining supply flagged as notice review, never marked eligible automatically',()=>{
 const rem={...apt,category:'remaining',dates:{SUBSCRPT_RCEPT_BGNDE:'2026-11-20'}};
 const e=eventsFor(rem,basic);
 assert.equal(e.length,1);assert.equal(e[0].label,'무순위');assert.equal(assess(e[0],basic).status,'review');
});
test('choose preferred area',()=>{
 assert.equal(chooseModel(apt,84).type,'084');assert.equal(chooseModel(apt,59).type,'059');
});
