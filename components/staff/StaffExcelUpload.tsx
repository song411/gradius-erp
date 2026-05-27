'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { X, Download, Upload, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import type { Staff, StaffRecommend } from '@/lib/supabase/types'

// ── 컬럼 매핑 정의 ────────────────────────────────────────────────
const COLUMNS = [
  { key: 'name',           label: '이름',           required: true  },
  { key: 'gender',         label: '성별',           required: false },
  { key: 'age',            label: '나이',           required: false },
  { key: 'height',         label: '신장(cm)',       required: false },
  { key: 'phone',          label: '연락처',         required: false },
  { key: 'id_number',      label: '주민등록번호',   required: false },
  { key: 'region',         label: '지역',           required: false },
  { key: 'english_skill',  label: '영어능력',       required: false },
  { key: 'driving',        label: '운전면허',       required: false },
  { key: 'available_jobs', label: '가능직무',       required: false },
  { key: 'certifications', label: '자격증',         required: false },
  { key: 'bank_name',      label: '은행명',         required: false },
  { key: 'account_number', label: '계좌번호',       required: false },
  { key: 'recommend',      label: '추천등급',       required: false },
  { key: 'memo',           label: '메모',           required: false },
]

// 예시 데이터 2행 (업로드 시 제거됨)
const SAMPLE_ROWS = [
  ['홍길동', '남', '28', '175', '010-1234-5678', '960101-1234567',
   '서울', '중', '1종', '행사도우미,팀장', '위생사', '국민', '123456-78-901234', '우선투입', '성실하고 대인관계 좋음'],
  ['김지수', '여', '25', '163', '010-9876-5432', '990505-2345678',
   '경기', '하', '없음', '행사도우미', '', '신한', '987654-32-100001', '일반', ''],
]

// 파싱된 행 타입
interface ParsedRow {
  rowIndex: number
  name: string
  gender: string
  age: string
  height: string
  phone: string
  id_number: string
  region: string
  english_skill: string
  driving: string
  available_jobs: string
  certifications: string
  bank_name: string
  account_number: string
  recommend: string
  memo: string
  // 중복 처리
  duplicateStaff?: Staff       // 동명이인이 있으면 기존 크루 정보
  duplicateAction: 'overwrite' | 'new'  // 기본값 overwrite
  error?: string
}

// ── 템플릿 다운로드 ───────────────────────────────────────────────
function downloadTemplate() {
  const headers = COLUMNS.map(c => c.label)
  const ws = XLSX.utils.aoa_to_sheet([headers, ...SAMPLE_ROWS])

  // 헤더 스타일 (컬럼 너비)
  ws['!cols'] = COLUMNS.map((c, i) => ({
    wch: [6, 4, 4, 6, 12, 16, 6, 8, 8, 20, 16, 6, 18, 8, 20][i] || 12,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '크루등록')

  // 안내 시트 추가
  const guide = XLSX.utils.aoa_to_sheet([
    ['📌 작성 가이드'],
    [''],
    ['항목', '입력 예시', '비고'],
    ['이름', '홍길동', '필수 항목'],
    ['성별', '남 또는 여', ''],
    ['나이', '28', '숫자만 입력'],
    ['신장(cm)', '175', '숫자만 입력'],
    ['연락처', '010-1234-5678', ''],
    ['주민등록번호', '960101-1234567', '민감정보 주의'],
    ['지역', '서울 / 경기 / 인천', ''],
    ['영어능력', '상 / 중 / 하 / 원어민 / 없음', ''],
    ['운전면허', '1종 / 2종 / 없음', ''],
    ['가능직무', '행사도우미,팀장', '쉼표로 구분'],
    ['자격증', '위생사,바리스타', '쉼표로 구분'],
    ['은행명', '국민 / 신한 / 우리 등', ''],
    ['계좌번호', '123456-78-901234', '숫자와 하이픈'],
    ['추천등급', '우선투입 / 일반 / 보류', '미입력 시 "일반"'],
    ['메모', '자유 입력', ''],
    [''],
    ['⚠️ 주의사항'],
    ['1행(헤더)과 2~3행(예시)은 자동으로 건너뜁니다. 4행부터 실제 데이터를 입력하세요.'],
    ['이름이 같은 크루가 이미 등록되어 있으면 덮어쓰기 여부를 선택할 수 있습니다.'],
    ['주민등록번호 등 민감 정보가 포함된 파일은 안전하게 보관하세요.'],
  ])
  guide['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, guide, '작성가이드')

  XLSX.writeFile(wb, '크루_일괄등록_템플릿.xlsx')
}

// ── 엑셀 파싱 ─────────────────────────────────────────────────────
function parseExcel(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]

        // 1행(헤더) + 2~3행(예시) 제거 → 실제 데이터는 4행(index 3)부터
        const dataRows = rows.slice(3).filter(r => r.some(c => String(c).trim()))

        const parsed: ParsedRow[] = dataRows.map((r, i) => ({
          rowIndex:       i + 4,
          name:           String(r[0] || '').trim(),
          gender:         String(r[1] || '').trim(),
          age:            String(r[2] || '').trim(),
          height:         String(r[3] || '').trim(),
          phone:          String(r[4] || '').trim(),
          id_number:      String(r[5] || '').trim(),
          region:         String(r[6] || '').trim(),
          english_skill:  String(r[7] || '').trim(),
          driving:        String(r[8] || '').trim(),
          available_jobs: String(r[9] || '').trim(),
          certifications: String(r[10] || '').trim(),
          bank_name:      String(r[11] || '').trim(),
          account_number: String(r[12] || '').trim(),
          recommend:      String(r[13] || '').trim() || '일반',
          memo:           String(r[14] || '').trim(),
          duplicateAction: 'overwrite',
          error: !String(r[0] || '').trim() ? '이름이 비어 있습니다.' : undefined,
        }))

        resolve(parsed)
      } catch {
        reject(new Error('파일을 읽을 수 없습니다. 올바른 엑셀 파일인지 확인해 주세요.'))
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}

// ── 메인 모달 컴포넌트 ────────────────────────────────────────────
export default function StaffExcelUpload({
  existingStaff,
  onClose,
  onDone,
}: {
  existingStaff: Staff[]
  onClose: () => void
  onDone: () => void
}) {
  const fileRef              = useRef<HTMLInputElement>(null)
  const [rows, setRows]      = useState<ParsedRow[]>([])
  const [step, setStep]      = useState<'upload' | 'preview' | 'done'>('upload')
  const [saving, setSaving]  = useState(false)
  const [doneCount, setDoneCount] = useState(0)

  // 파일 선택 후 파싱 + 동명이인 매핑
  async function handleFile(file: File) {
    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.')
      return
    }
    try {
      const parsed = await parseExcel(file)
      const mapped = parsed.map(row => {
        const dup = existingStaff.find(s => s.name === row.name)
        return { ...row, duplicateStaff: dup, duplicateAction: 'overwrite' as const }
      })
      setRows(mapped)
      setStep('preview')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // 동명이인 처리 방식 변경
  function setAction(rowIndex: number, action: 'overwrite' | 'new') {
    setRows(p => p.map(r => r.rowIndex === rowIndex ? { ...r, duplicateAction: action } : r))
  }

  // 최종 저장
  async function handleSave() {
    const valid = rows.filter(r => !r.error)
    if (!valid.length) { toast.error('등록할 수 있는 행이 없습니다.'); return }
    setSaving(true)

    let count = 0
    for (const row of valid) {
      const payload = {
        name:            row.name,
        gender:          row.gender || null,
        age:             row.age ? Number(row.age) : null,
        height:          row.height ? Number(row.height) : null,
        phone:           row.phone || null,
        id_number:       row.id_number || null,
        region:          row.region || null,
        english_skill:   row.english_skill || null,
        driving:         row.driving || null,
        available_jobs:  row.available_jobs
          ? row.available_jobs.split(',').map(s => s.trim()).filter(Boolean) : [],
        certifications:  row.certifications
          ? row.certifications.split(',').map(s => s.trim()).filter(Boolean) : [],
        bank_name:       row.bank_name || null,
        account_number:  row.account_number || null,
        recommend:       (['우선투입', '일반', '보류'].includes(row.recommend)
          ? row.recommend : '일반') as StaffRecommend,
        memo:            row.memo || null,
        attendance_score:  0,
        performance_score: 0,
        appearance_score:  0,
        teamwork_score:    0,
        total_score:       0,
      }

      try {
        if (row.duplicateStaff && row.duplicateAction === 'overwrite') {
          await db.update('staff', row.duplicateStaff.id, payload)
        } else {
          await db.insert('staff', payload)
        }
        count++
      } catch {
        // 개별 행 실패는 건너뜀
      }
    }

    setSaving(false)
    setDoneCount(count)
    setStep('done')
    toast.success(`${count}명의 크루가 등록되었습니다.`)
    onDone()
  }

  const validRows   = rows.filter(r => !r.error)
  const errorRows   = rows.filter(r => r.error)
  const dupRows     = rows.filter(r => r.duplicateStaff)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">크루 엑셀 일괄 등록</p>
              <p className="text-xs text-gray-400">템플릿을 다운로드하고 작성 후 업로드해 주세요</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 단계 표시 */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold">
          {['업로드', '미리보기 · 확인', '완료'].map((label, i) => {
            const cur = step === 'upload' ? 0 : step === 'preview' ? 1 : 2
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className="w-6 h-px bg-gray-300" />}
                <span className={`px-2.5 py-1 rounded-full ${cur === i ? 'bg-emerald-600 text-white' : cur > i ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-400'}`}>
                  {cur > i ? '✓ ' : `${i + 1}. `}{label}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ── STEP 1: 업로드 ── */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* 템플릿 다운로드 */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-blue-800 text-sm">1단계: 템플릿 다운로드</p>
                  <p className="text-xs text-blue-600 mt-0.5">예시 데이터가 포함된 양식을 받아 작성해 주세요.</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  템플릿 다운로드
                </button>
              </div>

              {/* 파일 업로드 드롭존 */}
              <div>
                <p className="font-semibold text-gray-700 text-sm mb-2">2단계: 작성한 파일 업로드</p>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-all cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                >
                  <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">클릭하거나 파일을 드래그해서 올려주세요</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx / .xls 파일만 가능</p>
                </div>
                <input
                  ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: 미리보기 ── */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* 요약 배지 */}
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">전체 {rows.length}행</span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">등록 가능 {validRows.length}명</span>
                {dupRows.length > 0 && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />동명이인 {dupRows.length}명
                  </span>
                )}
                {errorRows.length > 0 && (
                  <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-semibold">오류 {errorRows.length}행 (건너뜀)</span>
                )}
              </div>

              {/* 동명이인 경고 섹션 */}
              {dupRows.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    동명이인 처리 선택
                  </p>
                  <p className="text-xs text-amber-700">아래 크루는 이미 등록된 동명이인이 있습니다. 각 행에 대해 처리 방식을 선택해 주세요.</p>
                  {dupRows.map(row => (
                    <div key={row.rowIndex} className="bg-white border border-amber-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">
                            {row.name}
                            <span className="text-xs text-gray-400 ml-1.5 font-normal">
                              (엑셀 {row.rowIndex}행 · {row.gender || '성별미상'}, {row.age ? row.age + '세' : '나이미상'})
                            </span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            기존: {row.duplicateStaff!.name}
                            {row.duplicateStaff!.gender && ` · ${row.duplicateStaff!.gender}`}
                            {row.duplicateStaff!.age && ` · ${row.duplicateStaff!.age}세`}
                            {row.duplicateStaff!.phone && ` · ${row.duplicateStaff!.phone}`}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => setAction(row.rowIndex, 'overwrite')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${row.duplicateAction === 'overwrite' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'}`}
                          >덮어쓰기</button>
                          <button
                            onClick={() => setAction(row.rowIndex, 'new')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${row.duplicateAction === 'new' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}
                          >신규 등록</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 데이터 미리보기 테이블 */}
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left">행</th>
                      <th className="px-3 py-2 text-left">이름</th>
                      <th className="px-3 py-2 text-left">성별</th>
                      <th className="px-3 py-2 text-left">나이</th>
                      <th className="px-3 py-2 text-left">연락처</th>
                      <th className="px-3 py-2 text-left">지역</th>
                      <th className="px-3 py-2 text-left">추천등급</th>
                      <th className="px-3 py-2 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.rowIndex} className={`border-t border-gray-50 ${row.error ? 'bg-red-50' : row.duplicateStaff ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-2 text-gray-400">{row.rowIndex}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{row.name || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.gender || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.age || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.phone || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{row.region || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full font-semibold ${row.recommend === '우선투입' ? 'bg-emerald-100 text-emerald-700' : row.recommend === '보류' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                            {row.recommend || '일반'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {row.error
                            ? <span className="text-red-500 font-semibold">⚠ {row.error}</span>
                            : row.duplicateStaff
                              ? <span className="text-amber-600 font-semibold">
                                  {row.duplicateAction === 'overwrite' ? '🔄 덮어쓰기' : '➕ 신규등록'}
                                </span>
                              : <span className="text-emerald-600 font-semibold">✓ 신규등록</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 하단 버튼 */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setRows([]); setStep('upload') }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-semibold"
                >
                  다시 업로드
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || validRows.length === 0}
                  className="flex-2 flex-grow-[2] py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? '등록 중...' : `${validRows.length}명 일괄 등록`}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: 완료 ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mb-4" />
              <p className="text-xl font-extrabold text-gray-900 mb-1">{doneCount}명 등록 완료!</p>
              <p className="text-sm text-gray-500">크루 목록에서 바로 확인할 수 있습니다.</p>
              <button
                onClick={onClose}
                className="mt-8 px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700"
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
