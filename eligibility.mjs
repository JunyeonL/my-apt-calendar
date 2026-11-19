/** Conservative, informational pre-check only, never a legal eligibility decision. */
export function normalizeDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return '';
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(String(s)) ? String(s) : '';
}
export function yearsBetween(start, end) {
  if (!normalizeDate(start) || !normalizeDate(end) || start > end) return -1;
  const a = start.split('-').map(Number), b = end.split('-').map(Number);
  return b[0] - a[0] - (b[1] < a[1] || (b[1] === a[1] && b[2] < a[2]) ? 1 : 0);
}
export function monthsBetween(start, end) {
  if (!normalizeDate(start) || !normalizeDate(end) || start > end) return -1;
  const a = start.split('-').map(Number), b = end.split('-').map(Number);
  return (b[0] - a[0]) * 12 + b[1] - a[1] - (b[2] < a[2] ? 1 : 0);
}
export function cityFromAddress(address='') {
  const m = String(address).match(/(?:경기도|서울특별시|인천광역시)\s+([가-힣]+시|[가-힣]+군|[가-힣]+구)/);
  return m ? m[1] : '';
}
export function profileReady(profile) {
  return Boolean(profile.region && profile.city && normalizeDate(profile.accountSince) && profile.ownsHome !== 'unknown');
}
export function relevantFirstRank(listing, profile) {
  const d = listing.dates || {};
  const sameRegion = Boolean(profile.region && profile.region === listing.region);
  const sameCity = sameRegion && Boolean(profile.city && cityFromAddress(listing.address).includes(profile.city.replace(/\s/g,'')));
  if (sameCity && d.GNRL_RNK1_CRSPAREA_RCPTDE) return {date:d.GNRL_RNK1_CRSPAREA_RCPTDE, end:d.GNRL_RNK1_CRSPAREA_ENDDE, regionLabel:'해당지역'};
  if (profile.region === '경기' && listing.region === '경기' && d.GNRL_RNK1_ETC_GG_RCPTDE) return {date:d.GNRL_RNK1_ETC_GG_RCPTDE,end:d.GNRL_RNK1_ETC_GG_ENDDE,regionLabel:'기타경기'};
  if (d.GNRL_RNK1_ETC_AREA_RCPTDE) return {date:d.GNRL_RNK1_ETC_AREA_RCPTDE,end:d.GNRL_RNK1_ETC_AREA_ENDDE,regionLabel:'기타지역'};
  if (d.GNRL_RNK1_CRSPAREA_RCPTDE) return {date:d.GNRL_RNK1_CRSPAREA_RCPTDE,end:d.GNRL_RNK1_CRSPAREA_ENDDE,regionLabel:'지역 확인 필요'};
  return null;
}
export function eventsFor(listing, profile) {
  const result = [];
  const d = listing.dates || {};
  if (listing.category === 'remaining') {
    const when = d.SUBSCRPT_RCEPT_BGNDE || d.RCEPT_BGNDE || d.SPSPLY_RCEPT_BGNDE;
    if (normalizeDate(when)) result.push({kind:'remaining', label:'무순위',date:when,end:d.SUBSCRPT_RCEPT_ENDDE || d.RCEPT_ENDDE || when,regionLabel:'공고 확인'});
  } else {
    if (normalizeDate(d.SPSPLY_RCEPT_BGNDE)) result.push({kind:'special',label:'특별공급',date:d.SPSPLY_RCEPT_BGNDE,end:d.SPSPLY_RCEPT_ENDDE,regionLabel:'전체'});
    const first = relevantFirstRank(listing, profile);
    if (first && normalizeDate(first.date)) result.push({kind:'general',label:'일반 1순위',...first});
    if (!result.length && normalizeDate(d.RCEPT_BGNDE)) result.push({kind:'general',label:'청약접수',date:d.RCEPT_BGNDE,end:d.RCEPT_ENDDE,regionLabel:'공고 확인'});
  }
  // A listing without a receivable date is still visible on its announcement date.
  if (!result.length && normalizeDate(listing.announcementDate)) result.push({kind:'notice',label:'모집공고',date:listing.announcementDate,regionLabel:'공고 확인'});
  return result.map(e=>({...e,id:`${listing.id}:${e.kind}:${e.date}`,listing}));
}
function babyUnderTwo(profile, asOf) {
  return (profile.childBirths || []).some(d=>monthsBetween(d,asOf)>=0 && monthsBetween(d,asOf)<24);
}
export function assess(event, profile) {
  const listing = event.listing;
  const at = normalizeDate(listing.announcementDate) || event.date;
  const notes=[];
  const home = profile.ownsHome;
  if (!profileReady(profile)) return {status:'review',text:'조건 입력 필요',notes:['내 청약 조건에서 거주지·통장·주택 소유 여부를 입력해 주세요.']};
  if (event.kind === 'notice') return {status:'review',text:'공고 확인',notes:['청약접수일이 제공되지 않아 모집공고일로 표시했습니다.']};
  if (event.kind === 'remaining') return {status:'review',text:'모집공고 확인',notes:['무순위/잔여세대는 공급 유형별로 거주·주택 소유·재당첨 요건 등이 달라 공고문 확인이 필요합니다.']};
  if (event.kind === 'special') {
    if (home === 'yes') notes.push('유주택 세대의 특별공급 자격은 원칙적으로 제한되며 구체적인 기준을 확인해야 합니다.');
    else notes.push('무주택 여부는 입력 기준입니다. 세대원 전체 주택 소유 여부를 별도로 확인해야 합니다.');
    if ((profile.childBirths || []).length >= 2) notes.push('자녀 2명 이상: 다자녀 특별공급 대상 가능성을 확인하세요.');
    if (babyUnderTwo(profile,at)) notes.push('공고일 기준 24개월 미만 자녀: 신생아 특별공급 가능성 확인 대상입니다(적용 주택 유형 제한).');
    if (profile.marriedAt && yearsBetween(profile.marriedAt,at)>=0 && yearsBetween(profile.marriedAt,at)<7) notes.push('혼인 7년 이내: 신혼부부 특별공급 대상 가능성을 확인하세요.');
    notes.push('특별공급 세부 유형·소득·자산·해당지역 요건은 API만으로 검증할 수 없습니다.');
    return {status:'review',text:'특공 확인 필요',notes};
  }
  if (!normalizeDate(profile.accountSince) || profile.accountSince > at) return {status:'no',text:'가입일 확인',notes:['모집공고일 이후에 청약통장에 가입했습니다. 실제 통장/공고 기준을 확인하세요.']};
  const ageMonths = monthsBetween(profile.accountSince,at);
  if (profile.deposit === 'not-enough') return {status:'review',text:'예치금 확인',notes:['선택한 주택형의 면적·지역별 예치금 요건이 충족되지 않은 것으로 입력돼 있습니다.']};
  if (ageMonths < 24) notes.push(`통장 가입기간 ${ageMonths}개월. 규제지역 등에서 요구하는 기간을 모집공고문으로 확인해야 합니다.`);
  else notes.push('청약통장 가입 24개월 경과(일부 기본 기간 요건 확인).');
  if (profile.deposit !== 'enough') notes.push('청약통장 예치금 충족 여부를 확인하지 않았습니다.');
  if (home === 'yes') notes.push('유주택자의 1순위·추첨·가점 제한은 공고별로 다릅니다.');
  if (event.regionLabel === '기타지역' || event.regionLabel === '지역 확인 필요') notes.push('거주지역에 따른 신청 가능 여부 및 해당지역 우선공급 비율을 확인해야 합니다.');
  notes.push('소득·자산·세대주 여부·과거 당첨·재당첨 제한은 자동 확인 대상이 아닙니다.');
  const preliminary = ageMonths >= 24 && profile.deposit === 'enough' && home === 'no' && event.regionLabel !== '지역 확인 필요';
  return {status:preliminary?'possible':'review',text:preliminary?'기본 조건 충족':'추가 확인 필요',notes};
}
export function chooseModel(listing, preferredArea=84) {
  const models = (listing.models || []).filter(m=>typeof m.priceManwon === 'number' && m.priceManwon>0);
  if (!models.length) return null;
  return models.slice().sort((a,b)=>Math.abs((a.area??999)-preferredArea)-Math.abs((b.area??999)-preferredArea))[0];
}
