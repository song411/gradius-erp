#!/usr/bin/env python3
# staff 이동가능지역 복구 스크립트
# CSV의 이동가능지역 -> Supabase staff.region 업데이트

import csv, os, sys, json, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')

env_path = os.path.join(os.path.dirname(__file__), '../.env.local')
env = {}
with open(env_path, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()

URL = env.get('NEXT_PUBLIC_SUPABASE_URL', '')
KEY = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def get(table, params=''):
    url = f"{URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def patch(table, filter_param, body):
    url = f"{URL}/rest/v1/{table}?{filter_param}"
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=H, method='PATCH')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

csv_dir = r'C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs'

# 1. CSV에서 StaffID -> 이동가능지역 매핑
print('[1] STAFF.csv 읽기...')
csv_data = {}  # {이름: 이동가능지역}
csv_by_id = {}  # {StaffID: {이름, 이동가능지역, 연락처}}

with open(os.path.join(csv_dir, 'STAFF.csv'), encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        name = row.get('이름', '').strip()
        region = row.get('이동가능지역', '').strip()
        phone = row.get('연락처', '').strip()
        staff_id = row.get('StaffID', '').strip()
        recommend = row.get('추천도', '').strip()
        
        if name:
            csv_data[name] = {
                'region': region,
                'phone': phone,
                'staff_id': staff_id,
                'recommend': recommend,
            }

print(f'   CSV 스탭: {len(csv_data)}명')
with_region = sum(1 for v in csv_data.values() if v['region'])
print(f'   이동가능지역 있는 스탭: {with_region}명')

# 샘플 출력
sample = [(k, v['region']) for k, v in list(csv_data.items())[:5]]
print(f'   샘플: {sample}')

# 2. Supabase staff 전체 조회
print('\n[2] Supabase staff 조회...')
staff = get('staff', 'select=id,name,phone,region,recommend&limit=500')
print(f'   전체: {len(staff)}명')

# 3. 이름 + 연락처로 매칭 (이름이 같은 경우 대비)
print('\n[3] 매칭 및 업데이트...')
ok, fail, skip, no_match = 0, 0, 0, 0

for stt in staff:
    name = stt['name']
    csv_info = csv_data.get(name)
    
    if not csv_info:
        no_match += 1
        continue
    
    region = csv_info['region']
    recommend = csv_info['recommend']
    
    # 업데이트할 내용
    update_body = {}
    if region and not stt.get('region'):
        update_body['region'] = region
    if recommend and recommend != stt.get('recommend'):
        update_body['recommend'] = recommend
    
    if not update_body:
        skip += 1
        continue
    
    status = patch('staff', f"id=eq.{stt['id']}", update_body)
    if status in (200, 204):
        ok += 1
        print(f'   [OK] {name}: region={region}, recommend={recommend}')
    else:
        fail += 1
        print(f'   [FAIL] {name}: status={status}')

print(f'\n=== 완료 ===')
print(f'업데이트: {ok}건, 실패: {fail}건, 스킵(이미있음): {skip}건, 미매칭: {no_match}건')
