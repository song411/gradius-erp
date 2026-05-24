# -*- coding: utf-8 -*-
"""
estimate_items 재연결 스크립트

문제: 마이그레이션 시 estimate_items.inquiry_id 가 null로 삽입됨
해결: CSV 문의ID → inquiries.inquiry_code → inquiries.id(UUID) 매핑 후 재삽입

견적품목.csv 헤더:
  품목ID, 문의ID, 직군명, 수량, 일수, 매출단가, 매입단가, 규격, 비고, 팀장여부, 할인액, 구분
"""

import csv, sys, os, uuid, requests

SUPABASE_URL = "https://mpdpwmouxzhmostimafd.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZHB3bW91eHpobW9zdGltYWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzOTYzMiwiZXhwIjoyMDk1MDE1NjMyfQ.EvRzljTQvY7yxhMBVDkY8L2XujNrSbTsu1Ocl_615lw"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

CSV_BASE = r"C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs"

def get(table, params=""):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def delete_all_items():
    """현재 estimate_items 전부 삭제 (중복·미연결 정리)"""
    # Supabase REST: delete without filter → 전부 삭제 (neq id null 트릭)
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/estimate_items?id=neq.00000000-0000-0000-0000-000000000000",
        headers=HEADERS
    )
    print(f"  기존 삭제: status={r.status_code}")

def to_int(v, default=0):
    try:
        s = str(v).replace(",", "").strip()
        if not s: return default
        return int(float(s))
    except:
        return default

def to_float(v, default=0.0):
    try:
        s = str(v).replace(",", "").strip()
        if not s: return default
        return float(s)
    except:
        return default

def insert_batch(rows):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/estimate_items",
        json=rows, headers=HEADERS
    )
    if r.status_code not in (200, 201):
        print(f"  [ERR] {r.status_code} {r.text[:300]}")

def main():
    # 1. Supabase에서 inquiries 매핑 (inquiry_code → id)
    print("1. inquiries 매핑 로드...")
    inqs = get("inquiries", "select=id,inquiry_code")
    code_to_uuid = {i["inquiry_code"]: i["id"] for i in inqs if i.get("inquiry_code")}
    print(f"   매핑 수: {len(code_to_uuid)}")

    # 2. estimate_items 전부 삭제
    print("2. 기존 estimate_items 삭제...")
    delete_all_items()

    # 3. CSV 읽기 + 재삽입
    csv_path = os.path.join(CSV_BASE, "견적품목.csv")
    if not os.path.exists(csv_path):
        print(f"CSV 없음: {csv_path}")
        return

    with open(csv_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"3. CSV 행수: {len(rows)}")

    linked, unlinked = 0, 0
    batch = []

    for row in rows:
        raw_inq_id = (row.get("문의ID") or "").strip()
        inq_uuid = code_to_uuid.get(raw_inq_id)  # 매핑

        record = {
            "id": str(uuid.uuid4()),
            "inquiry_id": inq_uuid,
            "role_name": (row.get("직군명") or "").strip(),
            "quantity": to_int(row.get("수량")),
            "days": to_int(row.get("일수"), 1),
            "unit_price": to_int(row.get("매출단가")),
            "pay_unit_price": to_int(row.get("매입단가")),
            "spec": (row.get("규격") or "").strip(),
            "notes": (row.get("비고") or "").strip(),
            "is_leader": str(row.get("팀장여부", "")).strip().lower() in ("true", "1", "yes", "팀장"),
            "discount": to_int(row.get("할인액")),
            "item_type": (row.get("구분") or "인력").strip(),
        }

        if inq_uuid:
            linked += 1
        else:
            unlinked += 1

        batch.append(record)
        if len(batch) >= 100:
            insert_batch(batch)
            sys.stdout.write(f"\r  삽입 중... {linked+unlinked}/{len(rows)}")
            sys.stdout.flush()
            batch = []

    if batch:
        insert_batch(batch)

    print(f"\n완료: 연결됨={linked}, 미연결={unlinked}")

if __name__ == "__main__":
    main()
