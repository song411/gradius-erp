#!/usr/bin/env python3
# 세금계산서 발행여부 복구 v2
# CSV 문의ID -> inquiries.inquiry_code -> inquiries.id -> settlements.inquiry_id
# -> settlements.tax_invoice_issued = true 업데이트

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
        return e.code

# 1. CSV에서 발행완료 문의ID 수집
csv_dir = r'C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs'
files = [(f, os.path.getsize(os.path.join(csv_dir, f))) for f in os.listdir(csv_dir)]
files.sort(key=lambda x: x[1], reverse=True)
csv_file = os.path.join(csv_dir, files[0][0])
print(f"[1] CSV 파일: {files[0][0]}")

issued_codes = set()
with open(csv_file, encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        mid = row.get('문의ID', '').strip()
        tax = row.get('세금계산서 발행여부', '').strip()
        if tax == '발행완료' and mid:
            issued_codes.add(mid)

print(f"    발행완료 문의코드: {len(issued_codes)}건")
print(f"    샘플: {list(issued_codes)[:5]}")

# 2. inquiries에서 inquiry_code -> uuid 매핑
print("\n[2] inquiries 조회...")
inquiries = get('inquiries', 'select=id,inquiry_code,company_name&limit=200')
code_to_uuid = {i['inquiry_code']: i['id'] for i in inquiries if i.get('inquiry_code')}
print(f"    전체 inquiries: {len(inquiries)}건, inquiry_code 있는 건: {len(code_to_uuid)}")

# 발행완료 코드 -> UUID 매칭
matched_uuids = {}
for code in issued_codes:
    if code in code_to_uuid:
        matched_uuids[code] = code_to_uuid[code]
    else:
        # 부분 매칭 시도 (앞 8자리)
        for k, v in code_to_uuid.items():
            if k and (k.startswith(code) or code.startswith(k)):
                matched_uuids[code] = v
                break

print(f"    발행완료 {len(issued_codes)}건 중 UUID 매칭: {len(matched_uuids)}건")

if not matched_uuids:
    print("\n    매칭 실패! inquiry_code 예시:")
    for code in list(code_to_uuid.keys())[:5]:
        print(f"    '{code}'")
    print("    CSV 문의ID 예시:", list(issued_codes)[:5])
    exit(1)

# 3. settlements에서 inquiry_id로 조회
print("\n[3] settlements 조회...")
settlements = get('settlements', 'select=id,inquiry_id,company_name,tax_invoice_issued&limit=200')
uuid_to_sett = {str(s['inquiry_id']): s for s in settlements if s.get('inquiry_id')}
print(f"    전체 settlements: {len(settlements)}건")

# 4. 업데이트 대상 확인
to_update = []
for code, uuid in matched_uuids.items():
    sett = uuid_to_sett.get(str(uuid))
    if sett:
        to_update.append(sett)
    else:
        print(f"    [경고] settlement 없음: code={code}, uuid={uuid}")

print(f"\n    업데이트 대상: {len(to_update)}건")
already_true = [s for s in to_update if s['tax_invoice_issued'] == True]
print(f"    이미 true: {len(already_true)}건")
need_update = [s for s in to_update if s['tax_invoice_issued'] != True]
print(f"    업데이트 필요: {len(need_update)}건")

# 5. 실제 업데이트
print("\n[4] 업데이트 실행...")
ok, fail = 0, 0
for sett in need_update:
    status = patch('settlements', f"id=eq.{sett['id']}", {'tax_invoice_issued': True})
    if status in (200, 204):
        ok += 1
        print(f"    [OK] {sett['company_name']}")
    else:
        fail += 1
        print(f"    [FAIL] {sett['company_name']} status={status}")

print(f"\n=== 완료 ===")
print(f"성공: {ok}건, 실패: {fail}건")
print(f"(CSV 발행완료={len(issued_codes)}, UUID매칭={len(matched_uuids)}, settlement매칭={len(to_update)}, 업데이트={ok})")
