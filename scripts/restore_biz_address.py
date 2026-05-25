#!/usr/bin/env python3
# 계약건은청구금액적기.csv에서 사업장주소를 settlements.biz_address로 복구

import csv, os, json, urllib.request, urllib.error

env_path = os.path.join(os.path.dirname(__file__), '../.env.local')
env = {}
with open(env_path, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def get(table, params=''):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def patch(table, filter_param, body):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{filter_param}"
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"  HTTPError {e.code}: {e.read().decode()}")
        return e.code

# 1. CSV 읽기
csv_dir = r'C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs'
csv_file = os.path.join(csv_dir, '계약건은청구금액적기.csv')
print(f"[1] CSV 파일: {csv_file}")

csv_data = {}  # inquiry_code → {현장주소, 사업장주소}
with open(csv_file, encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        code = row.get('문의ID', '').strip()
        site_addr = row.get('현장주소', '').strip()
        biz_addr  = row.get('사업장주소', '').strip()
        if code:
            csv_data[code] = {'site_address': site_addr, 'biz_address': biz_addr}

print(f"    CSV 건수: {len(csv_data)}")
biz_cnt = sum(1 for v in csv_data.values() if v['biz_address'])
site_cnt = sum(1 for v in csv_data.values() if v['site_address'])
print(f"    사업장주소 있는 건: {biz_cnt}")
print(f"    현장주소 있는 건: {site_cnt}")

# 2. inquiries 조회 (inquiry_code → id 매핑)
print("\n[2] inquiries 조회...")
inquiries = get('inquiries', 'select=id,inquiry_code,company_name&limit=500')
code_to_uuid = {i['inquiry_code']: i['id'] for i in inquiries if i.get('inquiry_code')}
print(f"    전체 inquiries: {len(inquiries)}, inquiry_code 있는 건: {len(code_to_uuid)}")

# 3. settlements 조회
print("\n[3] settlements 조회...")
settlements = get('settlements', 'select=id,inquiry_id,company_name,site_address,biz_address&limit=500')
inq_to_sett = {str(s['inquiry_id']): s for s in settlements if s.get('inquiry_id')}
print(f"    전체 settlements: {len(settlements)}")

# 4. 업데이트 실행
print("\n[4] 업데이트 실행...")
ok_biz, ok_site, skip, fail = 0, 0, 0, 0

for code, addrs in csv_data.items():
    uuid = code_to_uuid.get(code)
    if not uuid:
        # 부분 매칭 시도
        for k, v in code_to_uuid.items():
            if k and (k.startswith(code) or code.startswith(k)):
                uuid = v
                break
    if not uuid:
        continue

    sett = inq_to_sett.get(str(uuid))
    if not sett:
        continue

    payload = {}

    # 사업장주소: CSV에 있고 DB가 비어있으면 업데이트
    if addrs['biz_address'] and not sett.get('biz_address'):
        payload['biz_address'] = addrs['biz_address']

    # 현장주소: CSV에 있고 DB가 비어있으면 site_address 업데이트
    if addrs['site_address'] and not sett.get('site_address'):
        payload['site_address'] = addrs['site_address']

    if not payload:
        skip += 1
        continue

    status = patch('settlements', f"id=eq.{sett['id']}", payload)
    if status in (200, 204):
        if 'biz_address' in payload:
            ok_biz += 1
            print(f"    [OK 사업장] {sett['company_name']}: {addrs['biz_address']}")
        if 'site_address' in payload:
            ok_site += 1
    else:
        fail += 1
        print(f"    [FAIL] {sett['company_name']} status={status}")

print(f"\n=== 완료 ===")
print(f"사업장주소 업데이트: {ok_biz}건")
print(f"현장주소 업데이트: {ok_site}건")
print(f"스킵(이미 있음): {skip}건")
print(f"실패: {fail}건")
