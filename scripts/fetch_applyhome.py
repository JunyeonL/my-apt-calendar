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
}
PAGE_SIZE = 500
MAX_PAGES = 200


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


def normalize(row, category, models_by_id):
    manage_no = string(row.get('HOUSE_MANAGE_NO'))
    pblanc_no = string(row.get('PBLANC_NO'))
    unique_id = f'{category}-{manage_no}-{pblanc_no}'
    matching = models_by_id.get((manage_no, pblanc_no), [])
    model_list = []
    for model in matching:
        amount = number(model.get('LTTOT_TOP_AMOUNT'))
        area = number(model.get('EXCLUSE_AR'))
        model_list.append({
            'type': string(model.get('HOUSE_TY')),
            'area': area,
            'priceManwon': amount if amount and amount > 0 else None,
            'supply': number(model.get('SUPLY_HSHLDCO')),
            'specialSupply': number(model.get('SPSPLY_HSHLDCO')),
        })
    model_list.sort(key=lambda x: x['area'] if x['area'] is not None else 9999)
    general_keys = [
        'GNRL_RNK1_CRSPAREA_RCPTDE', 'GNRL_RNK1_CRSPAREA_ENDDE',
        'GNRL_RNK1_ETC_GG_RCPTDE', 'GNRL_RNK1_ETC_GG_ENDDE',
        'GNRL_RNK1_ETC_AREA_RCPTDE', 'GNRL_RNK1_ETC_AREA_ENDDE',
        'GNRL_RNK2_CRSPAREA_RCPTDE', 'GNRL_RNK2_ETC_GG_RCPTDE',
        'GNRL_RNK2_ETC_AREA_RCPTDE', 'SPSPLY_RCEPT_BGNDE',
        'SPSPLY_RCEPT_ENDDE', 'SUBSCRPT_RCEPT_BGNDE', 'SUBSCRPT_RCEPT_ENDDE',
        'RCEPT_BGNDE', 'RCEPT_ENDDE', 'PRZWNER_PRESNATN_DE',
    ]
    dates = {key: date(row.get(key)) for key in general_keys}
    return {
        'id': unique_id,
        'name': string(row.get('HOUSE_NM')),
        'category': category,
        'region': string(row.get('SUBSCRPT_AREA_CODE_NM')),
        'address': string(row.get('HSSPLY_ADRES')),
        'housingType': string(row.get('HOUSE_DTL_SECD_NM')),
        'houseCategory': string(row.get('HOUSE_SECD_NM')),
        'households': number(row.get('TOT_SUPLY_HSHLDCO')),
        'announcementDate': date(row.get('RCRIT_PBLANC_DE')),
        'publicHousing': string(row.get('PUBLIC_HOUSE_SPCLW_APPLC_AT')).upper() == 'Y' or string(row.get('HOUSE_DTL_SECD_NM')) == '국민',
        'regulated': string(row.get('SPECLT_RDN_EARTH_AT')).upper() == 'Y' or string(row.get('MDAT_TRGET_AREA_SECD')).upper() == 'Y',
        'url': safe_applyhome_url(row.get('PBLANC_URL')),
        'dates': dates,
        'models': model_list,
    }


def main():
    # Accept both the Decoding and Encoding forms provided by data.go.kr.
    key = urllib.parse.unquote(os.getenv('DATA_GO_KR_API_KEY', '').strip())
    if not key:
        print('DATA_GO_KR_API_KEY is absent. Existing dataset preserved.', file=sys.stderr)
        return 2
    today = dt.datetime.now(ZoneInfo('Asia/Seoul')).date()
    cutoff = today - dt.timedelta(days=370)
    upper = today + dt.timedelta(days=390)
    conditions = {
        'cond[RCRIT_PBLANC_DE::GTE]': cutoff.isoformat(),
        'cond[RCRIT_PBLANC_DE::LTE]': upper.isoformat(),
    }
    # All four endpoints are fetched before touching existing data.
    sections = {}
    for category, (detail_endpoint, model_endpoint) in ENDPOINTS.items():
        detail = fetch_all(detail_endpoint, key, conditions)
        models = fetch_all(model_endpoint, key)
        indexed = {}
        for model in models:
            pair = (string(model.get('HOUSE_MANAGE_NO')), string(model.get('PBLANC_NO')))
            indexed.setdefault(pair, []).append(model)
        sections[category] = [normalize(row, category, indexed) for row in detail]
    items = []
    for category, entries in sections.items():
        for entry in entries:
            when = entry['announcementDate']
            if when and cutoff <= dt.date.fromisoformat(when) <= upper:
                items.append(entry)
    if not items:
        raise RuntimeError('API returned no announcements in current window. Keeping existing dataset.')
    items.sort(key=lambda x: (x['announcementDate'] or '', x['name']))
    payload = {
        'source': '한국부동산원 청약홈 공공데이터 API',
        'updatedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
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
