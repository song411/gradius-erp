import csv, os, sys
sys.stdout.reconfigure(encoding='utf-8')

csv_dir = r'C:\Users\Win11\Downloads\gradius_python-master (1)\gradius_python-master\migration_csvs'

# STAFF.csv 헤더 + 첫 행
staff_file = os.path.join(csv_dir, 'STAFF.csv')
with open(staff_file, encoding='utf-8-sig', newline='') as f:
    reader = csv.reader(f)
    header = next(reader)
    row1 = next(reader)

print('=== STAFF 컬럼 목록 ===')
for i, (k, v) in enumerate(zip(header, row1)):
    print(f'  [{i:02d}] {k}: {str(v)[:60]}')

# 배정기록 CSV 탐색
print('\n=== 전체 CSV 파일 헤더 ===')
files = sorted(os.listdir(csv_dir))
for fname in files:
    full = os.path.join(csv_dir, fname)
    size = os.path.getsize(full)
    try:
        with open(full, encoding='utf-8-sig', newline='') as fp:
            h = next(csv.reader(fp))
            short = ' | '.join(h[:10])
            print(f'\n{fname} ({size:,} bytes)')
            print(f'  헤더: {short}')
    except Exception as e:
        print(f'{fname}: 읽기실패 {e}')
