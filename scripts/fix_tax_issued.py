#!/usr/bin/env python3
# 세금계산서 발행여부 복구 스크립트
# CSV에서 '발행완료'인 건을 찾아 Supabase settlements 테이블 업데이트

import csv
import os
import json
import urllib.request
import urllib.parse

# 환경변수 읽기
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

def supabase_get(table, params=''):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def supabase_patch(table, filter_param, body):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{filter_param}"
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=HEADERS, method='PATCH')
    with urllib.request.urlopen(req) as r:
        return r.status

# CSV 파일 경로
csv_dir = r'C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs'
# 가장 큰 파일 찾기
files = [(f, os.path.getsize(os.path.join(csv_dir, f))) for f in os.listdir(csv_dir)]
files.sort(key=lambda x: x[1], reverse=True)
csv_file = os.path.join(csv_dir, files[0][0])
print(f"CSV 파일: {files[0][0]} ({files[0][1]:,} bytes)")

# CSV 파싱 (python csv 모듈로 올바르게 파싱)
issued_ids = []  # 발행완료 문의ID
all_data = {}    # {문의ID: {진행상황, 발행여부, ...}}

with open(csv_file, encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        inquiry_id = row.get('문의ID', '').strip()
        tax_status = row.get('세금계산서 발행여부', '').strip()
        progress = row.get('진행상황', '').strip()
        deposit = row.get('입금여부', '').strip()
        
        all_data[inquiry_id] = {
            'tax_status': tax_status,
            'progress': progress,
            'deposit': deposit,
            'company': row.get('업체', '').strip(),
        }
        
        if tax_status == '발행완료':
            issued_ids.append(inquiry_id)

print(f"\n전체 CSV 건수: {len(all_data)}")
print(f"발행완료: {len(issued_ids)}건")

# 발행여부 값 분포
from collections import Counter
tax_vals = Counter(v['tax_status'] for v in all_data.values())
print(f"\n세금계산서 발행여부 값 분포: {dict(tax_vals)}")

progress_vals = Counter(v['progress'] for v in all_data.values())
print(f"진행상황 값 분포: {dict(progress_vals)}")

# Supabase settlements 조회
print("\n\n=== Supabase settlements 현황 ===")
settlements = supabase_get('settlements', 'select=id,inquiry_id,company_name,tax_invoice_issued,progress,deposit_status&limit=200')
print(f"총 {len(settlements)}건")

sett_by_inq = {str(s['inquiry_id']): s for s in settlements if s.get('inquiry_id')}
print(f"inquiry_id 있는 건: {len(sett_by_inq)}")

# 발행완료인 CSV ID와 settlements 매칭
matched_issued = []
for csvid in issued_ids:
    if csvid in sett_by_inq:
        matched_issued.append(sett_by_inq[csvid])

print(f"\nCSV 발행완료 {len(issued_ids)}건 중 settlements 매칭: {len(matched_issued)}건")
if matched_issued:
    print("샘플:")
    for s in matched_issued[:5]:
        print(f"  inquiry_id={s['inquiry_id']}, company={s['company_name']}, 현재 tax_invoice_issued={s['tax_invoice_issued']}")

# 실제 업데이트
print(f"\n\n=== Supabase 업데이트 시작 ===")
updated = 0
failed = 0

for sett in matched_issued:
    if sett['tax_invoice_issued'] == True:
        print(f"  이미 True: {sett['company_name']}")
        continue
    try:
        status = supabase_patch('settlements', f"id=eq.{sett['id']}", {'tax_invoice_issued': True})
        if status in (200, 204):
            updated += 1
            print(f"  [OK] {sett['company_name']} -> tax_invoice_issued=true")
        else:
            failed += 1
            print(f"  [FAIL] {sett['company_name']}, status={status}")
    except Exception as e:
        failed += 1
        print(f"  [ERROR] {sett['company_name']}: {e}")

print(f"\n완료: 업데이트={updated}, 실패={failed}")
print(f"(CSV 발행완료 {len(issued_ids)}건 중 매칭={len(matched_issued)}건 업데이트 시도)")
