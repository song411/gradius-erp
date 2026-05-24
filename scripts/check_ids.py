#!/usr/bin/env python3
# ID 형식 비교 확인
import csv, os, json, urllib.request

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

# CSV ID 형식 확인
csv_dir = r'C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs'
files = [(f, os.path.getsize(os.path.join(csv_dir, f))) for f in os.listdir(csv_dir)]
files.sort(key=lambda x: x[1], reverse=True)
csv_file = os.path.join(csv_dir, files[0][0])

csv_ids = []
with open(csv_file, encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        mid = row.get('문의ID', '').strip()
        tax = row.get('세금계산서 발행여부', '').strip()
        csv_ids.append((mid, tax))

print("CSV 문의ID 샘플 (앞 5개):", csv_ids[:5])
print(f"CSV 전체 {len(csv_ids)}건, 발행완료 {sum(1 for _, t in csv_ids if t=='발행완료')}건")

# Supabase settlements inquiry_id 형식 확인
settlements = get('settlements', 'select=id,inquiry_id,company_name,tax_invoice_issued&limit=10')
print("\nSupabase settlements inquiry_id 샘플:")
for s in settlements[:5]:
    print(f"  id={s['id']}, inquiry_id={s['inquiry_id']}, company={s['company_name']}")

# Supabase inquiries id 형식 확인
inquiries = get('inquiries', 'select=id,client_name,created_at&limit=5')
print("\nSupabase inquiries id 샘플:")
for i in inquiries[:5]:
    print(f"  id={i['id']}, client={i['client_name']}")

# 매칭 시도: CSV 문의ID vs Supabase inquiries.id
all_settlements = get('settlements', 'select=id,inquiry_id,company_name,tax_invoice_issued&limit=200')
sett_inq_ids = set(str(s['inquiry_id']) for s in all_settlements if s.get('inquiry_id'))
csv_id_set = set(mid for mid, _ in csv_ids)

overlap = sett_inq_ids & csv_id_set
print(f"\n겹치는 ID: {len(overlap)}개")
print("Supabase inquiry_id 예시:", list(sett_inq_ids)[:3])
print("CSV 문의ID 예시:", list(csv_id_set)[:3])
