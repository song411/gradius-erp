import csv, os, sys, json, urllib.request
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
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

def get(table, params=''):
    url = f"{URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

csv_dir = r'C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs'

# 1. 배정기록.csv 상세
print('=== 배정기록.csv 상세 ===')
with open(os.path.join(csv_dir, '배정기록.csv'), encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    rows = list(reader)
print(f'전체: {len(rows)}건')
print('컬럼:', list(rows[0].keys()) if rows else [])
print('\n샘플 [0]:')
if rows:
    for k, v in rows[0].items():
        print(f'  {k}: {str(v)[:80]}')

# 2. 지급내역.csv 상세
print('\n=== 지급내역.csv 상세 ===')
with open(os.path.join(csv_dir, '지급내역.csv'), encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    pay_rows = list(reader)
print(f'전체: {len(pay_rows)}건')
print('컬럼:', list(pay_rows[0].keys()) if pay_rows else [])
print('\n샘플 [0]:')
if pay_rows:
    for k, v in pay_rows[0].items():
        print(f'  {k}: {str(v)[:80]}')

# 3. Supabase에 지급내역 테이블이 있는지 확인
print('\n=== Supabase 테이블 탐색 ===')
for t in ['payouts', 'payout_records', 'pay_histories', 'staff_payouts', 'payments', 'dispatches']:
    try:
        r = get(t, 'select=*&limit=1')
        if isinstance(r, list):
            print(f'[존재] {t}: {len(r)}건, 컬럼: {list(r[0].keys()) if r else "비어있음"}')
        elif isinstance(r, dict) and r.get('message'):
            pass  # 테이블 없음
    except Exception as e:
        pass

# 4. assignments에서 staff_type 분포 재확인
print('\n=== assignments staff_type 분포 ===')
asgns = get('assignments', 'select=staff_type,status,is_payable&limit=500')
from collections import Counter
print('staff_type:', dict(Counter(a['staff_type'] for a in asgns)))
print('is_payable:', dict(Counter(str(a['is_payable']) for a in asgns)))

# 5. 이동가능지역 Supabase에 있는지 확인
print('\n=== staff 이동가능지역 컬럼 확인 ===')
staff = get('staff', 'select=name,region&limit=5')
print('region 컬럼 샘플:', staff[:3])
# 혹시 다른 컬럼명인지 전체 조회
staff_all = get('staff', 'select=*&limit=1')
if staff_all:
    print('staff 전체 컬럼:', list(staff_all[0].keys()))
