#!/usr/bin/env python3
"""Fetch the official Korea Real Estate Board ApplyHome public-data API.

No secret or personal profile is written to the generated JSON.
Requires a data.go.kr API key as DATA_GO_KR_API_KEY.
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/'
ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'data' / 'listings.json'
ENDPOINTS = {
    'apt': ('getAPTLttotPblancDetail', 'getAPTLttotPblancMdl'),
    'remaining': ('getRemndrLttotPblancDetail', 'getRemndrLttotPblancMdl'),
    'optional': ('getOPTLttotPblancDetail', 'getOPTLttotPblancMdl'),
    'urban': ('getUrbtyOfctlLttotPblancDetail', 'getUrbtyOfctlLttotPblancMdl'),
    'publicRent': ('getPblPvtRentLttotPblancDetail', 'getPblPvtRentLttotPblancMdl'),
}
PAGE_SIZE = 500
MAX_PAGES = 200
SPECIAL_SUPPLY_FIELDS = {
    'multiChild': 'MNYCH_HSHLDCO',
    'newborn': 'NWBB_HSHLDCO',
    'newlywed': 'NWWDS_HSHLDCO',
    'firstHome': 'LFE_FRST_HSHLDCO',
    'elderlyParent': 'OLD_PARNTS_SUPORT_HSHLDCO',
    'institution': 'INSTT_RECOMEND_HSHLDCO',
    'relocatedInstitution': 'TRANSR_INSTT_ENFSN_HSHLDCO',
    'youth': 'YGMN_HSHLDCO',
    'other': 'ETC_HSHLDCO',
}
RECEIPT_PERIODS = [
    ('SPSPLY_RCEPT_BGNDE', 'SPSPLY_RCEPT_ENDDE'),
    ('SUBSCRPT_RCEPT_BGNDE', 'SUBSCRPT_RCEPT_ENDDE'),
    ('GNRL_RCEPT_BGNDE', 'GNRL_RCEPT_ENDDE'),
    ('RCEPT_BGNDE', 'RCEPT_ENDDE'),
] + [(f'GNRL_RNK{rank}_{area}_RCPTDE', f'GNRL_RNK{rank}_{area}_ENDDE')
     for rank in (1, 2) for area in ('CRSPAREA', 'ETC_GG', 'ETC_AREA')]


def collection_window(today):
    first = today.replace(day=1)
    after = dt.date(first.year + (first.month + 1) // 12, (first.month + 1) % 12 + 1, 1)
    return first.isoformat(), (after - dt.timedelta(days=1)).isoformat()


def in_window(dates, notice, first, last):
    periods = [(dates[start], dates.get(end) or dates[start])
               for start, end in RECEIPT_PERIODS if dates.get(start)]
    if not periods:
        return bool(notice and first <= notice <= last)
    return any(start <= last and max(start, end) >= first for start, end in periods)


def receipt_dates(row):
    keys = [key for pair in RECEIPT_PERIODS for key in pair]
    return {key: date(row.get(key)) for key in [*keys, 'PRZWNER_PRESNATN_DE']}


def query(endpoint, key, page, conditions=None):
    params = urllib.parse.urlencode({
        'page': page, 'perPage': PAGE_SIZE, 'returnType': 'JSON', 'serviceKey': key,
        **(conditions or {}),
    })
    req = urllib.request.Request(BASE + endpoint + '?' + params, headers={
        'User-Agent': 'my-apt-calendar/1.0', 'Accept': 'application/json',
    })
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                data = json.load(response)
            if not isinstance(data, dict) or not isinstance(data.get('data'), list):
                raise ValueError('Unexpected API response format')
            return data
        except (urllib.error.URLError, TimeoutError, ValueError) as err:
            # Do not log request URLs or response bodies: they may contain the key.
            last_err = f'HTTP {err.code}' if isinstance(err, urllib.error.HTTPError) else type(err).__name__
            if attempt < 2:
                time.sleep(1 + attempt * 2)
    raise RuntimeError(f'{endpoint} page {page}: {last_err}')


def fetch_all(endpoint, key, conditions=None):
    result = []
    for page in range(1, MAX_PAGES + 1):
        response = query(endpoint, key, page, conditions)
        items = response['data']
        result.extend(items)
        expected = response.get('matchCount', response.get('totalCount'))
        print(f'{endpoint}: page {page}, rows={len(items)}, total={expected}', flush=True)
        if isinstance(expected, int) and len(result) >= expected:
            return result
        if not items:
            if isinstance(expected, int) and len(result) < expected:
                raise RuntimeError(f'{endpoint}: incomplete response; existing dataset preserved')
            return result
        if not isinstance(expected, int) and len(items) < PAGE_SIZE:
            return result
    raise RuntimeError(f'{endpoint}: exceeded pagination safety limit ({MAX_PAGES})')


def string(value):
    return str(value).strip() if value is not None else ''


def date(value):
    s = string(value)
    if not s:
        return None
    if re.fullmatch(r'\d{8}', s):
        s = f'{s[:4]}-{s[4:6]}-{s[6:]}'
    try:
        return dt.date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return None


def number(value):
    try:
        return float(string(value).replace(',', ''))
    except (ValueError, TypeError):
        return None


def safe_applyhome_url(value):
    s = string(value)
    parsed = urllib.parse.urlparse(s)
    if parsed.scheme == 'https' and parsed.hostname in {'www.applyhome.co.kr', 'applyhome.co.kr'}:
        return s
    return None


def exclusive_area(model):
    area = number(model.get('EXCLUSE_AR'))
    if area is not None and area > 0:
        return area
    # APT/remaining APIs encode exclusive area in HOUSE_TY (e.g. 084.9409A).
    # SUPLY_AR includes common space and must not be used as exclusive area.
    match = re.match(r'^(\d+(?:\.\d+)?)', string(model.get('HOUSE_TY')))
    area = number(match.group(1)) if match else None
    return area if area is not None and area > 0 else None


RENT_SPECIAL_FIELDS = {'youth': 'SPSPLY_YGMN_HSHLDCO', 'newlywed': 'SPSPLY_NEW_MRRG_HSHLDCO',
                       'elderly': 'SPSPLY_AGED_HSHLDCO'}


def normalize_model(model, category):
    grouped = category in ('urban', 'publicRent')
    amount = number(model.get('SUPLY_AMOUNT' if grouped else 'LTTOT_TOP_AMOUNT'))
    households = number(model.get('SUPLY_HSHLDCO'))
    if grouped:
        group = string(model.get('GP'))
        if group.isdigit():
            group += '군'
        model_type = ' · '.join(part for part in (group, string(model.get('TP'))) if part)
        total = households
        general = number(model.get('GNSPLY_HSHLDCO'))
        special = total - general if general is not None and total is not None and total >= general else None
        fields = RENT_SPECIAL_FIELDS if category == 'publicRent' else {}
    else:
        model_type = string(model.get('HOUSE_TY'))
        general = households
        special = number(model.get('SPSPLY_HSHLDCO'))
        total = general + special if general is not None and special is not None else None
        fields = SPECIAL_SUPPLY_FIELDS
    return {
        'type': model_type, 'area': exclusive_area(model),
        'priceManwon': amount if amount and amount > 0 else None,
        'supply': general, 'specialSupply': special, 'totalSupply': total,
        'specialBreakdown': {name: number(model.get(field)) for name, field in fields.items()},
    }


def supply_type(row, category):
    house = string(row.get('HOUSE_SECD_NM'))
    detail = string(row.get('HOUSE_DTL_SECD_NM') or row.get('HOUSE_DETAIL_SECD_NM'))
    if category == 'remaining':
        return '불법행위재공급' if string(row.get('HOUSE_SECD')).zfill(2) == '06' or '불법' in house else '무순위'
    if category == 'optional':
        return '임의공급'
    if category == 'urban':
        labels = {'01': '도시형생활주택', '02': '오피스텔', '03': '민간임대', '04': '생활숙박시설'}
        return detail or labels.get(string(row.get('HOUSE_DTL_SECD')).zfill(2)) or house or '도시형·오피스텔 등'
    if category == 'publicRent':
        return '공공지원민간임대'
    return detail or house or 'APT'


def supply_region(row):
    region = string(row.get('SUBSCRPT_AREA_CODE_NM'))
    address = string(row.get('HSSPLY_ADRES')).split()
    value = region or (address[0] if address else '')
    for short, full in [('서울', '서울특별시'), ('경기', '경기도'), ('인천', '인천광역시')]:
        if value in (short, full):
            return short
    return value


def normalize(row, category, models_by_id):
    manage_no = string(row.get('HOUSE_MANAGE_NO'))
    pblanc_no = string(row.get('PBLANC_NO'))
    unique_id = f'{category}-{manage_no}-{pblanc_no}'
    matching = models_by_id.get((manage_no, pblanc_no), [])
    model_list = sorted((normalize_model(m, category) for m in matching),
                        key=lambda m: (m['area'] is None, m['area'] or 0, m['type']))
    public_law = {'Y': True, 'N': False}.get(string(row.get('PUBLIC_HOUSE_SPCLW_APPLC_AT')).upper())
    return {
        'id': unique_id,
        'name': string(row.get('HOUSE_NM')),
        'category': category,
        'region': supply_region(row),
        'address': string(row.get('HSSPLY_ADRES')),
        'housingType': string(row.get('HOUSE_DTL_SECD_NM') or row.get('HOUSE_DETAIL_SECD_NM')),
        'supplyType': supply_type(row, category),
        'houseCategory': string(row.get('HOUSE_SECD_NM')),
        'households': number(row.get('TOT_SUPLY_HSHLDCO')),
        'announcementDate': date(row.get('RCRIT_PBLANC_DE')),
        'publicHousing': string(row.get('PUBLIC_HOUSE_SPCLW_APPLC_AT')).upper() == 'Y' or string(row.get('HOUSE_DTL_SECD_NM')) == '국민',
        'publicHousingLaw': public_law,
        'regulated': string(row.get('SPECLT_RDN_EARTH_AT')).upper() == 'Y' or string(row.get('MDAT_TRGET_AREA_SECD')).upper() == 'Y',
        'speculative': string(row.get('SPECLT_RDN_EARTH_AT')).upper() == 'Y',
        'overheated': string(row.get('MDAT_TRGET_AREA_SECD')).upper() == 'Y',
        'publicDistrict': string(row.get('PUBLIC_HOUSE_EARTH_AT')).upper() == 'Y',
        'url': safe_applyhome_url(row.get('PBLANC_URL')),
        'dates': receipt_dates(row),
        'models': model_list,
    }


def main():
    # Accept both the Decoding and Encoding forms provided by data.go.kr.
    key = urllib.parse.unquote(os.getenv('DATA_GO_KR_API_KEY', '').strip())
    if not key:
        print('DATA_GO_KR_API_KEY is absent. Existing dataset preserved.', file=sys.stderr)
        return 2
    today = dt.datetime.now(ZoneInfo('Asia/Seoul')).date()
    first, last = collection_window(today)
    # The API only filters by notice date. An older notice can still be open.
    conditions = {'cond[RCRIT_PBLANC_DE::LTE]': last}
    items = []
    saw_detail = False
    for category, (detail_endpoint, model_endpoint) in ENDPOINTS.items():
        for row in fetch_all(detail_endpoint, key, conditions):
            saw_detail = True
            if not in_window(receipt_dates(row), date(row.get('RCRIT_PBLANC_DE')), first, last):
                continue
            pair = (string(row.get('HOUSE_MANAGE_NO')), string(row.get('PBLANC_NO')))
            if not all(pair):
                raise ValueError('Missing notice identifiers; existing dataset preserved')
            filters = {'cond[HOUSE_MANAGE_NO::EQ]': pair[0], 'cond[PBLANC_NO::EQ]': pair[1]}
            models = fetch_all(model_endpoint, key, filters)
            matching = [m for m in models if (string(m.get('HOUSE_MANAGE_NO')), string(m.get('PBLANC_NO'))) == pair]
            items.append(normalize(row, category, {pair: matching}))
    if not saw_detail:
        raise RuntimeError('All historical notice endpoints returned no rows. Keeping existing dataset.')
    items.sort(key=lambda x: (x['announcementDate'] or '', x['name']))
    payload = {
        'source': '한국부동산원 청약홈 공공데이터 API',
        'updatedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'window': {'first': first, 'last': last},
        'feeds': list(ENDPOINTS),
        'items': items,
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = DEST.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(DEST)
    print(f'Wrote {len(items)} announcements to {DEST}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
