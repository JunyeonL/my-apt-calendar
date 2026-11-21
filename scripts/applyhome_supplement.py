"""Fill gaps in the official API with notices from the public ApplyHome republication."""
import concurrent.futures
import datetime as dt
import html
import json
import re
import time
import urllib.error
import urllib.request

MIRROR = "https://foxgori.com"
FAMILIES = {
    "optional-supply": "optional", "public-private-rental": "publicRent",
    "officetel": "urban", "urban-house": "urban", "private-rental": "urban",
    "lodging": "urban",
}


def get(path):
    request = urllib.request.Request(MIRROR + path, headers={"User-Agent": "my-apt-calendar/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 2 or (isinstance(exc, urllib.error.HTTPError)
                                and exc.code < 500 and exc.code != 429):
                raise
            time.sleep(2 ** attempt)


def text(cell):
    return html.unescape(re.sub('<[^>]+>', '', cell)).strip()


def num(value):
    value = value.replace(',','').strip()
    return float(value) if re.fullmatch(r'\d+(?:\.\d+)?',value) else None


def price(value):
    if not re.search(r'(억|만원)',value): return None
    large = re.search(r'([\d,.]+)\s*억',value)
    small = re.search(r'([\d,]+)\s*만원',value)
    return (float(large[1].replace(',',''))*10000 if large else 0)+(int(small[1].replace(',','')) if small else 0)


def period(label, notice):
    dates = re.findall(r'(?<!\d)(?:(?:20\d{2})\.)?(0?[1-9]|1[0-2])\.(\d{1,2})(?!\d)',label)
    result = []
    year = int(notice[:4])
    for month,day in dates:
        date = dt.date(year,int(month),int(day))
        prior = result[-1] if result else dt.date.fromisoformat(notice)
        if date < prior and date.month < prior.month: year+=1; date=date.replace(year=year)
        result.append(date)
    return [x.isoformat() for x in result]


def model_rows(page,category):
    models={}
    for raw in re.findall(r'<table\b[^>]*>.*?</table>',page,re.S):
        if '주택형별 공급 세대와 최고 분양가' not in raw and '주택형별 특별공급 유형별 세대수' not in raw: continue
        head=re.search(r'<thead>(.*?)</thead>',raw,re.S)
        body=re.search(r'<tbody>(.*?)</tbody>',raw,re.S)
        if not head or not body: continue
        columns=[text(cell) for cell in re.findall(r'<th\b[^>]*>(.*?)</th>',head[1],re.S)]
        for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>',body[1],re.S):
            cells=[text(cell) for cell in re.findall(r'<t[hd]\b[^>]*>(.*?)</t[hd]>',row,re.S)]
            if not cells or cells[0]=='합계': continue
            values=dict(zip(columns,cells))
            label=values.get('주택형',''); model=models.setdefault(label,{'type':label,'area':None,'priceManwon':None,'supply':None,'specialSupply':None,'totalSupply':None,'specialBreakdown':{}})
            if '최고 분양가' in values:
                area=re.search(r'([\d.]+)\s*㎡',label)
                model['area']=float(area[1]) if area else None
                model['priceManwon']=price(values['최고 분양가'])
                general=num(values.get('일반','')); special=num(values.get('특별',''))
                if category=='urban':
                    model['totalSupply']=general
                else:
                    model['supply']=general;model['specialSupply']=special
                    if general is not None and special is not None: model['totalSupply']=general+special
            for name,key in [('신혼부부','newlywed'),('청년','youth'),('고령자','elderly'),('다자녀','multiChild'),('신생아','newborn')]:
                if name in values: model['specialBreakdown'][key]=num(values[name])
    return list(models.values())


def add_missing_notices(feed):
    first, last = feed["window"]["first"], feed["window"]["last"]
    markup = get("/cheongyak/calendar/")
    match = re.search(r'data-index="([^"]+)"', markup)
    if not match or not match[1].startswith("/cheongyak/assets/"):
        raise ValueError("Public notice index missing")
    index = json.loads(get(html.unescape(match[1])))
    if not index.get("items") or not index.get("as_of"):
        raise ValueError("Incomplete public notice index")

    # The two official identifiers stay the same across the API and the republication.
    known = {i["id"].split("-", 1)[1] for i in feed["items"]}
    candidates = []
    for row in index["items"]:
        category = FAMILIES.get(row["c"])
        if not category or row["id"] in known or not row.get("d") or row["d"] > last:
            continue
        if not re.fullmatch(r"\d+-\d+", row["id"]):
            raise ValueError("Invalid public notice identifier")
        schedule = (row.get("t") or "").split(" · ")[0]
        dates = period(schedule, row["d"]) if schedule.startswith("접수") else []
        start, end = (dates[0], dates[-1]) if dates else (row["d"], row["d"])
        if start <= last and end >= first:
            candidates.append((row, category, dates))
            known.add(row["id"])

    def load_notice(candidate):
        row, category, dates = candidate
        page = get("/cheongyak/notice/" + row["id"] + "/")
        official = re.search(r'href="(https://www\.applyhome\.co\.kr/[^"]+)"', page)
        label = index["labels"]["category"][row["c"]]
        return {
            "id": category + "-" + row["id"], "category": category,
            "supplyType": label, "houseCategory": label, "housingType": label,
            "name": row["n"], "region": index["labels"]["region"].get(row["r"], ""),
            "address": row["a"], "households": row["h"], "announcementDate": row["d"],
            "dates": {"SUBSCRPT_RCEPT_BGNDE": dates[0], "SUBSCRPT_RCEPT_ENDDE": dates[-1]} if dates else {},
            "url": html.unescape(official[1]) if official else None,
            "models": model_rows(page, category),
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        additions = list(pool.map(load_notice, candidates))
    if additions:
        feed["items"] = sorted(feed["items"] + additions, key=lambda i: (i.get("announcementDate") or "", i["name"]))
        feed["sourceInfo"] = {"aptAt": feed["updatedAt"], "mirrorAsOf": index["as_of"],
                              "mirror": "FOX부동산 청약 보드", "mirrorAdded": len(additions)}
    print(f"Public supplement: {len(additions)} notices", flush=True)
