"""
STAFF.csv의 근태/수행/외모/팀워크 점수를 Supabase staff 테이블에 복구하는 스크립트
- 각 항목: 0~5점 (소수점 포함, 예: 4.5)
- total_score = 4개 점수의 합계 (최대 20점)
"""

import csv, sys, os, time
sys.stdout.reconfigure(encoding='utf-8')

# gradius-erp의 supabase 설정 직접 사용
SUPABASE_URL = "https://mpdpwmouxzhmostimafd.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZHB3bW91eHpobW9zdGltYWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzOTYzMiwiZXhwIjoyMDk1MDE1NjMyfQ.EvRzljTQvY7yxhMBVDkY8L2XujNrSbTsu1Ocl_615lw"

CSV_PATH = r"C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs\STAFF.csv"

import urllib.request, json, urllib.error

def supabase_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def supabase_patch(table, row_id, payload):
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }, method="PATCH")
    try:
        with urllib.request.urlopen(req) as r:
            return True, r.status
    except urllib.error.HTTPError as e:
        return False, e.read().decode()

def safe_float(v):
    try:
        return float(v.strip()) if v and v.strip() else None
    except:
        return None

def to_int(v):
    """소수점 반올림 (4.5 → 5, 4.4 → 4)"""
    if v is None:
        return 0
    return round(v)  # Python round: 4.5 → 4 (banker's rounding), use int(v + 0.5) for standard
    # 명시적 반올림 (0.5 올림)

def to_int_round(v):
    if v is None:
        return 0
    return int(v + 0.5)  # 4.5 → 5, 4.4 → 4

print("=" * 60)
print("  STAFF 점수 복구 스크립트")
print("=" * 60)

# 1. CSV 로드
print("\n[1] STAFF.csv 읽기...")
with open(CSV_PATH, encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))
print(f"  CSV 총 {len(rows)}명")

# 점수 있는 직원만 대상
scored = []
for r in rows:
    att = safe_float(r.get('근태',''))
    per = safe_float(r.get('수행',''))
    app = safe_float(r.get('외모',''))
    tea = safe_float(r.get('팀워크',''))
    if any(v is not None for v in [att, per, app, tea]):
        scored.append({
            'name': r.get('이름','').strip(),
            'att': att or 0,
            'per': per or 0,
            'app': app or 0,
            'tea': tea or 0,
        })
print(f"  점수 있는 크루: {len(scored)}명")

# 2. DB에서 전체 staff 불러오기
print("\n[2] Supabase staff 테이블 조회...")
db_staff = supabase_get('staff', 'select=id,name,attendance_score&limit=1000')
print(f"  DB 크루: {len(db_staff)}명")

# 이름 → id 맵핑
name_to_id = {}
for s in db_staff:
    name_to_id[s['name']] = s['id']

# 3. 점수 업데이트
print("\n[3] 점수 업데이트 시작...")
updated = 0
not_found = []
skipped = 0

for item in scored:
    name = item['name']
    if not name:
        continue
    
    row_id = name_to_id.get(name)
    if not row_id:
        not_found.append(name)
        continue
    
    att   = round(item['att'], 1)
    per   = round(item['per'], 1)
    app   = round(item['app'], 1)
    tea   = round(item['tea'], 1)
    total = round(att + per + app + tea, 1)
    payload = {
        'attendance_score':  att,
        'performance_score': per,
        'appearance_score':  app,
        'teamwork_score':    tea,
        'total_score':       total,
    }
    
    ok, result = supabase_patch('staff', row_id, payload)
    if ok:
        updated += 1
        if updated % 20 == 0:
            print(f"  진행: {updated}/{len(scored)}명")
    else:
        print(f"  ✗ 실패 [{name}]: {result}")
    
    time.sleep(0.05)

print(f"\n{'='*60}")
print(f"  완료: {updated}명 점수 업데이트")
if not_found:
    print(f"  미매칭 (이름 다름): {len(not_found)}명")
    for n in not_found[:10]:
        print(f"    - {n}")
print("=" * 60)
