#!/usr/bin/env python3
# 본사 인원 4명을 staff 테이블에 등록
import os, json, urllib.request, urllib.error, sys
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
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json', 'Prefer': 'return=representation'}

def insert(table, body):
    url = f"{URL}/rest/v1/{table}"
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=H, method='POST')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# 본사 인원 4명 - memo 필드에 [본사] 태그로 구별
company_staff = [
    {'name': '최규성', 'gender': '남', 'recommend': '우선투입', 'memo': '[본사]', 'available_jobs': ['총괄', '현장관리'], 'certifications': ['본사직원']},
    {'name': '송무재', 'gender': '남', 'recommend': '우선투입', 'memo': '[본사]', 'available_jobs': ['총괄', '현장관리'], 'certifications': ['본사직원']},
    {'name': '여지은', 'gender': '여', 'recommend': '우선투입', 'memo': '[본사]', 'available_jobs': ['총괄', '현장관리'], 'certifications': ['본사직원']},
    {'name': '김영찬', 'gender': '남', 'recommend': '우선투입', 'memo': '[본사]', 'available_jobs': ['총괄', '현장관리'], 'certifications': ['본사직원']},
]

print('=== 본사 인원 등록 ===')
for s in company_staff:
    try:
        result = insert('staff', s)
        print(f"[OK] {s['name']} -> id: {result[0]['id']}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[FAIL] {s['name']}: {body}")
