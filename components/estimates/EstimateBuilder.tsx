'use client'

import { useState, useEffect, useRef } from 'react'
import { db } from '@/lib/supabase/api'
import { calcVAT, calcProfitRate, formatKRW, toKoreanAmount } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import {
  Trash2, Star, ChevronDown, ChevronUp, Zap, X,
  Download, Printer, Package, FileText, BarChart3,
  Clock, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Inquiry, Estimate, EstimateItem } from '@/lib/supabase/types'

// ── 공급자 정보 ──────────────────────────────────────────
const CO = {
  name: '주식회사 가디어스', ceo: '최규성',
  regNo: '429-88-01469', address: '서울시 종로구 동망산1길 2, 1층',
  phone: '1600-2944', bank: '기업은행',
  bankAccount: '132-119648-04-019', bankHolder: '주식회사 가디어스',
}

// ── 품목 유형 ────────────────────────────────────────────
const ITEM_TYPES = ['인력', '교통비', '숙박비', '식비', '연장수당', '지원품목', '기타'] as const
type ItemType = typeof ITEM_TYPES[number]
const EXTRA_TYPES: ItemType[] = ['교통비', '숙박비', '식비', '연장수당', '기타']
const SUPPORT_TYPES: ItemType[] = ['지원품목']

// 지원품목 프리셋
const SUPPORT_PRESETS = ['무전기', '안전조끼', '경광봉', '바디캠', '응급키트', '직접입력']

// 시간 빠른선택
const START_TIMES  = ['07:00', '07:30', '08:00', '08:30', '09:00', '10:00']
const END_TIMES    = ['15:00', '16:00', '17:00', '18:00', '19:00', '21:00', '22:00']
const HOUR_PRESETS = ['4H', '5H', '6H', '8H', '8.5H', '9H', '10H', '12H', '14H']

// ── 타입 ─────────────────────────────────────────────────
interface Role   { id: string; role_name: string; base_price: number; pay_price: number; leader_bonus: number }
interface Factor { id: string; role_id: string; factor_name: string; add_price: number; add_pay_price: number }
interface ItemRow {
  key: string; role_id: string; role_name: string
  quantity: number; days: number
  unit_price: number; pay_unit_price: number
  work_time: string; is_leader: boolean
  item_type: ItemType; spec: string
  selectedFactors: string[]; _basePrice: number; _basePayPrice: number
}
interface ReportMemo { strategy: string; staff: string; special: string; conclusion: string }
interface Props {
  open: boolean; onClose: () => void; onSaved: () => void
  inquiries: Inquiry[]
  editTarget?: (Estimate & { estimate_items?: EstimateItem[] }) | null
  preselectedInquiryId?: string | null
  // 복수 견적 지원: 기본 버전 라벨 (A안 / B안 ...)
  defaultVersionLabel?: string
}

function makeKey() { return Math.random().toString(36).slice(2) }
function emptyRow(type: ItemType = '인력', defaultWorkTime = ''): ItemRow {
  return {
    key: makeKey(), role_id: '', role_name: '', quantity: 1, days: 1,
    unit_price: 0, pay_unit_price: 0, work_time: defaultWorkTime, is_leader: false,
    item_type: type, spec: '', selectedFactors: [], _basePrice: 0, _basePayPrice: 0,
  }
}

// ── 견적번호 자동 생성 (EST-YYYYMMDD-XXXX) ───────────────
function generateEstimateCode(): string {
  const now = new Date()
  const ymd = now.toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  }).replace(/\. /g, '').replace('.', '').replace(/ /g, '')
  // 앞에서 8자리(YYYYMMDD) 추출
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `EST-${dateStr}-${rand}`
}

// ── 날짜 범위 → 일수 계산 ────────────────────────────────
function calcDays(start?: string, end?: string): number {
  if (!start) return 1
  if (!end || end === start) return 1
  const s = new Date(start), e = new Date(end)
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
}

// ── 메인 컴포넌트 ─────────────────────────────────────────
export default function EstimateBuilder({
  open, onClose, onSaved, inquiries, editTarget, preselectedInquiryId, defaultVersionLabel,
}: Props) {
  const [roles, setRoles]     = useState<Role[]>([])
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError]     = useState('')
  const [expandedFactor, setExpandedFactor] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'preview' | 'report'>('preview')
  const [reportMemo, setReportMemo] = useState<ReportMemo>({ strategy: '', staff: '', special: '', conclusion: '' })
  const previewRef  = useRef<HTMLDivElement>(null)
  const reportRef   = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    inquiry_id: '', site_name: '', manager: '', contact_phone: '',
    site_address: '', attire: '', meal: '', parking: '',
    notes: '', extra_cost: 0, include_vat: true,
    event_days: 1,   // 전역 행사 일수
    days_mode: 'auto' as 'auto' | 'manual',  // 자동(문의기준) or 수동
    version_label: 'A안',  // 견적 버전 라벨
  })
  const [items, setItems] = useState<ItemRow[]>([emptyRow()])

  // ── 데이터 로드 ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      db.list<Role>('roles', { order: 'role_name', asc: true }),
      db.list<Factor>('factors', { order: 'factor_name', asc: true }),
    ]).then(([r, f]) => { setRoles(r); setFactors(f); setLoading(false) })
  }, [open])

  // ── 초기화 ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setRightTab('preview')
    setReportMemo({ strategy: '', staff: '', special: '', conclusion: '' })

    if (editTarget) {
      const inq = inquiries.find(i => i.id === editTarget.inquiry_id)
      const days = calcDays(inq?.event_start, inq?.event_end)
      setForm({
        inquiry_id: editTarget.inquiry_id || '',
        site_name: editTarget.site_name || '', manager: editTarget.manager || '',
        contact_phone: inq?.phone || '', site_address: editTarget.site_address || '',
        attire: editTarget.attire || '', meal: editTarget.meal || '',
        parking: editTarget.parking || '', notes: editTarget.notes || '',
        extra_cost: editTarget.extra_cost || 0, include_vat: editTarget.vat > 0,
        event_days: days, days_mode: 'auto',
        version_label: editTarget.version_label || 'A안',
      })
      const rows: ItemRow[] = (editTarget.estimate_items || []).map(item => ({
        key: makeKey(), role_id: '', role_name: item.role_name || '',
        quantity: item.quantity, days: item.days,
        unit_price: item.unit_price, pay_unit_price: item.pay_unit_price,
        // DB spec 필드는 "work_time / spec" 형태로 저장되므로 첫 번째 ' / ' 기준으로 분리
        work_time: item.spec?.split(' / ')[0] || '',
        spec: item.spec?.split(' / ').slice(1).join(' / ') || '',
        is_leader: item.is_leader,
        item_type: (item.item_type as ItemType) || '인력',
        selectedFactors: [], _basePrice: item.unit_price, _basePayPrice: item.pay_unit_price,
      }))
      setItems(rows.length > 0 ? rows : [emptyRow()])
    } else {
      const preInq = preselectedInquiryId ? inquiries.find(i => i.id === preselectedInquiryId) : null
      const days = calcDays(preInq?.event_start, preInq?.event_end)
      setForm({
        inquiry_id: preselectedInquiryId || '',
        site_name: preInq?.location || '', manager: preInq?.contact_name || '',
        contact_phone: preInq?.phone || '', site_address: preInq?.location || '',
        attire: preInq?.attire || '', meal: preInq?.meal || '',
        parking: preInq?.parking || '', notes: '',
        extra_cost: 0, include_vat: true, event_days: days, days_mode: 'auto',
        version_label: defaultVersionLabel || 'A안',
      })
      const wt = preInq?.event_time || ''
      setItems([{ ...emptyRow('인력', wt), days }])
    }
    setError(''); setExpandedFactor(null)
  }, [open, editTarget, preselectedInquiryId, inquiries])

  // ── 문의 선택 ────────────────────────────────────────────
  function handleInquiryChange(inqId: string) {
    const inq = inquiries.find(i => i.id === inqId)
    const days = calcDays(inq?.event_start, inq?.event_end)
    const wt = inq?.event_time || ''
    setForm(f => ({
      ...f, inquiry_id: inqId,
      site_name: f.site_name || inq?.location || '',
      manager: f.manager || inq?.contact_name || '',
      contact_phone: f.contact_phone || inq?.phone || '',
      site_address: f.site_address || inq?.location || '',
      attire: f.attire || inq?.attire || '',
      meal: f.meal || inq?.meal || '',
      parking: f.parking || inq?.parking || '',
      event_days: days, days_mode: 'auto',
    }))
    // 기존 인력 항목의 work_time / days 를 문의 데이터로 채움
    if (wt) {
      setItems(prev => prev.map(r => ({
        ...r,
        work_time: r.work_time || wt,
        days: r.days === 1 ? days : r.days,
      })))
    }
  }

  // 행사 일수 전역 변경 → 전체 품목 일수 일괄 적용
  function applyGlobalDays(d: number) {
    setForm(f => ({ ...f, event_days: d, days_mode: 'manual' }))
    setItems(prev => prev.map(r => ({ ...r, days: d })))
  }

  // ── 직군/팩터 ────────────────────────────────────────────
  function handleRoleSelect(key: string, roleId: string) {
    const role = roles.find(r => r.id === roleId)
    setItems(prev => prev.map(row => {
      if (row.key !== key) return row
      if (!role) return { ...row, role_id: '', role_name: '', unit_price: 0, pay_unit_price: 0, _basePrice: 0, _basePayPrice: 0, selectedFactors: [] }
      const bp = role.base_price + (row.is_leader ? role.leader_bonus : 0)
      return { ...row, role_id: roleId, role_name: role.role_name, unit_price: bp, pay_unit_price: role.pay_price, _basePrice: role.base_price, _basePayPrice: role.pay_price, selectedFactors: [] }
    }))
  }
  function handleLeaderToggle(key: string) {
    setItems(prev => prev.map(row => {
      if (row.key !== key) return row
      const role = roles.find(r => r.id === row.role_id)
      const bonus = role?.leader_bonus || 0
      const newLeader = !row.is_leader
      const fs = row.selectedFactors.reduce((s, fid) => s + (factors.find(x => x.id === fid)?.add_price || 0), 0)
      return { ...row, is_leader: newLeader, unit_price: row._basePrice + (newLeader ? bonus : 0) + fs }
    }))
  }
  function handleFactorToggle(key: string, factorId: string) {
    setItems(prev => prev.map(row => {
      if (row.key !== key) return row
      const role = roles.find(r => r.id === row.role_id)
      const bonus = role?.leader_bonus || 0
      const newSel = row.selectedFactors.includes(factorId) ? row.selectedFactors.filter(id => id !== factorId) : [...row.selectedFactors, factorId]
      const fs  = newSel.reduce((s, fid) => s + (factors.find(x => x.id === fid)?.add_price || 0), 0)
      const fps = newSel.reduce((s, fid) => s + (factors.find(x => x.id === fid)?.add_pay_price || 0), 0)
      return { ...row, selectedFactors: newSel, unit_price: row._basePrice + (row.is_leader ? bonus : 0) + fs, pay_unit_price: row._basePayPrice + fps }
    }))
  }
  function updateRow(key: string, field: keyof ItemRow, val: unknown) {
    setItems(prev => prev.map(r => r.key === key ? { ...r, [field]: val } : r))
  }
  function removeRow(key: string) { setItems(prev => prev.filter(r => r.key !== key)) }

  // ── 프리셋 추가 ──────────────────────────────────────────
  const selectedInq = inquiries.find(i => i.id === form.inquiry_id)
  const defaultWt   = selectedInq?.event_time || ''

  function addRow(type: ItemType = '인력', overrides: Partial<ItemRow> = {}) {
    const base = emptyRow(type, type === '인력' ? defaultWt : '')
    setItems(prev => [...prev, { ...base, days: form.event_days, ...overrides }])
  }
  function addMeal(variant: 'provided' | 'cost') {
    const overrides = variant === 'provided'
      ? { role_name: '식비', work_time: '1인 1식', spec: '의뢰사 제공 [미제공시 1만원 추가 청구]', unit_price: 0, pay_unit_price: 0 }
      : { role_name: '식비', work_time: '1인 1식', unit_price: 10000, pay_unit_price: 10000 }
    addRow('식비', overrides)
  }
  function addParking() { addRow('기타', { role_name: '주차비', spec: '발생시 실비 청구', unit_price: 0, pay_unit_price: 0 }) }
  function addSupport(name: string) {
    addRow('지원품목', { role_name: name === '직접입력' ? '' : name, spec: '본사 지원', unit_price: 0, pay_unit_price: 0 })
  }

  // ── 금액 계산 ─────────────────────────────────────────────
  const billableItems = items.filter(r => !SUPPORT_TYPES.includes(r.item_type))
  const staffItems    = billableItems.filter(r => !EXTRA_TYPES.includes(r.item_type))
  const extraItems    = billableItems.filter(r =>  EXTRA_TYPES.includes(r.item_type))
  const supportItems  = items.filter(r => SUPPORT_TYPES.includes(r.item_type))

  const staffSubtotal = staffItems.reduce((s, r) => s + r.quantity * r.days * r.unit_price, 0)
  const extraSubtotal = extraItems.reduce((s, r) => s + r.quantity * r.days * r.unit_price, 0)
  const supplyPrice   = staffSubtotal + extraSubtotal + form.extra_cost
  const costPrice     = billableItems.reduce((s, r) => s + r.quantity * r.days * r.pay_unit_price, 0)
  const { vat, total } = calcVAT(form.include_vat ? supplyPrice : 0)
  const finalTotal    = form.include_vat ? total : supplyPrice
  const profitRate    = calcProfitRate(supplyPrice, costPrice)

  // 수익 리포트 전용 (인력 품목만)
  const staffBilling  = staffItems.reduce((s, r) => s + r.quantity * r.days * r.unit_price, 0)
  const staffCost     = staffItems.reduce((s, r) => s + r.quantity * r.days * r.pay_unit_price, 0)
  const staffProfit   = staffBilling - staffCost
  const staffRate     = staffBilling > 0 ? Math.round((staffProfit / staffBilling) * 1000) / 10 : 0

  // ── 저장 ─────────────────────────────────────────────────
  async function handleSave() {
    if (!form.inquiry_id) {
      setError('연결할 문의를 선택해주세요.')
      toast.error('문의를 먼저 선택해주세요.')
      return
    }
    const namedItems = items.filter(r => r.role_name && !SUPPORT_TYPES.includes(r.item_type))
    if (namedItems.length === 0) {
      setError('인력 또는 부대비용 품목을 1개 이상 입력해주세요.')
      toast.error('품목을 1개 이상 입력해주세요.')
      return
    }

    setSaving(true); setError('')

    const payload = {
      // 신규 저장 시에만 견적번호 생성, 수정 시에는 기존 번호 유지
      ...(!editTarget ? { estimate_code: generateEstimateCode() } : {}),
      version_label: form.version_label || 'A안',
      inquiry_id: form.inquiry_id,
      company_name: selectedInq?.company_name || '',
      event_name: selectedInq?.event_name || '',
      site_name: form.site_name || null,
      manager: form.manager || null,
      site_address: form.site_address || null,
      attire: form.attire || null,
      meal: form.meal || null,
      parking: form.parking || null,
      notes: form.notes || null,
      supply_price: supplyPrice,
      vat: form.include_vat ? vat : 0,
      total_price: finalTotal,
      cost_price: costPrice,
      extra_cost: form.extra_cost,
      profit_rate: profitRate,
      // expected_profit: DB에서 자동 계산되는 generated column — 직접 삽입 불가
    }

    const saveId = toast.loading(editTarget ? '견적을 수정하는 중...' : '견적을 저장하는 중...')

    try {
      let estId: string

      if (editTarget) {
        await db.update('estimates', editTarget.id, payload)
        estId = editTarget.id
        await db.deleteWhere('estimate_items', { estimate_id: editTarget.id })
      } else {
        const ins = await db.insert<Estimate>('estimates', payload)
        estId = ins[0].id
        await db.update('inquiries', form.inquiry_id, { status: '견적' })
      }

      const itemsPayload = items.map(row => ({
        estimate_id: estId,
        inquiry_id: form.inquiry_id,
        role_name: row.role_name,
        quantity: row.quantity,
        days: row.days,
        unit_price: row.unit_price,
        pay_unit_price: row.pay_unit_price,
        is_leader: row.is_leader,
        item_type: row.item_type,
        spec: [row.work_time, row.spec].filter(Boolean).join(' / ') || null,
      }))

      await db.insert('estimate_items', itemsPayload)

      toast.success(
        editTarget
          ? `견적이 수정되었습니다. (${selectedInq?.company_name})`
          : `견적이 저장되었습니다! (${selectedInq?.company_name} — ${itemsPayload.length}개 품목)`,
        { id: saveId, duration: 4000 }
      )

      setSaving(false)
      onSaved()
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      toast.error(`저장 실패: ${msg}`, { id: saveId })
      setSaving(false)
    }
  }

  async function handleDownloadImage() {
    if (!previewRef.current) return
    setExporting(true)
    try {
      const h2c = (await import('html2canvas')).default
      // html2canvas는 Korean 폰트(Malgun Gothic) descender 때문에 텍스트가 아래로 치우침
      // vertical-align 대신 padding 보정으로 강제 중앙 배치
      const ths = Array.from(previewRef.current.querySelectorAll<HTMLElement>('th'))
      const tds = Array.from(previewRef.current.querySelectorAll<HTMLElement>('td'))
      const allCells = [...ths, ...tds]
      const origStyles = allCells.map(c => c.getAttribute('style') || '')

      ths.forEach(c => {
        c.style.verticalAlign = 'top'
        c.style.lineHeight = '1'
        c.style.paddingTop = '12px'
        c.style.paddingBottom = '4px'
      })
      tds.forEach(c => {
        c.style.verticalAlign = 'top'
        c.style.lineHeight = '1'
        c.style.paddingTop = '11px'
        c.style.paddingBottom = '4px'
      })

      const canvas = await h2c(previewRef.current, {
        scale: 2, useCORS: true, allowTaint: true,
        backgroundColor: '#fff', logging: false,
      })
      allCells.forEach((c, i) => c.setAttribute('style', origStyles[i]))

      const link = document.createElement('a')
      link.download = `견적서_${selectedInq?.company_name || ''}_${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png'); link.click()
    } catch (err) {
      console.error('견적서 저장 오류:', err)
      toast.error('이미지 저장에 실패했습니다.')
    } finally { setExporting(false) }
  }

  async function handleDownloadReport() {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const h2c = (await import('html2canvas')).default
      // overflow 임시 해제
      const overflowEls = Array.from(reportRef.current.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-hidden'))
      const origOvStyles = overflowEls.map(e => e.getAttribute('style') || '')
      overflowEls.forEach(e => { e.style.overflow = 'visible' })

      const canvas = await h2c(reportRef.current, {
        scale: 2, useCORS: true, allowTaint: true,
        backgroundColor: '#f9fafb', logging: false,
      })
      // 원복
      overflowEls.forEach((e, i) => e.setAttribute('style', origOvStyles[i]))

      const link = document.createElement('a')
      link.download = `수익리포트_${selectedInq?.company_name || ''}_${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png'); link.click()
    } catch (err) {
      console.error('리포트 저장 오류:', err)
      toast.error('리포트 이미지 저장에 실패했습니다.')
    } finally { setExporting(false) }
  }

  function handlePrint() {
    if (!previewRef.current) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>견적서</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#fff}@media print{@page{size:A4;margin:10mm}}</style></head><body>${previewRef.current.outerHTML}</body></html>`)
    win.document.close(); win.print()
  }

  if (!open) return null

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '')
  const eventStart  = selectedInq?.event_start?.slice(0, 10) || ''
  const eventEnd    = selectedInq?.event_end?.slice(0, 10) || ''
  const eventPeriod = eventStart ? (eventEnd && eventEnd !== eventStart ? `${eventStart} ~ ${eventEnd}` : eventStart) : '-'
  const autoDays    = calcDays(selectedInq?.event_start, selectedInq?.event_end)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      {/* ── 헤더 바 ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-800">{editTarget ? '견적 수정' : '견적 작성'}</span>
          {form.version_label && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">{form.version_label}</span>
          )}
          {selectedInq && <span className="text-sm text-gray-400">— {selectedInq.company_name} / {selectedInq.event_name}</span>}
        </div>
        <div className="flex items-center gap-2">
          {rightTab === 'preview' && <>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="h-3.5 w-3.5" />인쇄</Button>
            <Button variant="outline" size="sm" onClick={handleDownloadImage} disabled={exporting} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />{exporting ? '처리 중...' : '견적서 이미지'}
            </Button>
          </>}
          {rightTab === 'report' && (
            <Button variant="outline" size="sm" onClick={handleDownloadReport} disabled={exporting} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />{exporting ? '처리 중...' : '리포트 이미지'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 px-6">
            {saving ? '저장 중...' : (editTarget ? '수정 완료' : '✓ 견적 저장')}
          </Button>
          <button onClick={onClose} className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 왼쪽: 입력 폼 (화면의 40% ~ 최소 460px) ── */}
        <div className="w-[40%] min-w-[460px] max-w-[580px] shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-5 space-y-5">
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

            {/* 1. 연결 문의 */}
            <section>
              <SectionTitle step={1} label="연결 문의" />
              <Select value={form.inquiry_id} onChange={e => handleInquiryChange(e.target.value)}>
                <option value="">문의 선택 *</option>
                {inquiries.map(i => (
                  <option key={i.id} value={i.id}>[{i.status}] {i.company_name} — {i.event_name}{i.event_start ? ` (${i.event_start.slice(0, 10)})` : ''}</option>
                ))}
              </Select>
              {selectedInq && (
                <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700 space-y-1">
                  <div className="font-semibold">{selectedInq.company_name} / {selectedInq.event_name}</div>
                  <div className="flex flex-wrap gap-x-3 text-blue-500">
                    {eventStart && <span>📅 {eventPeriod} ({autoDays}일)</span>}
                    {selectedInq.location && <span>📍 {selectedInq.location}</span>}
                    {selectedInq.required_staff && <span>👥 {selectedInq.required_staff}명</span>}
                    {selectedInq.event_time && <span>🕐 {selectedInq.event_time}</span>}
                  </div>
                </div>
              )}
            </section>

            {/* 버전 라벨 (A안/B안 등) — 연결 문의 바로 아래 */}
            <section>
              <SectionTitle step={2} label="견적 버전 라벨" />
              <div className="flex items-center gap-2 flex-wrap">
                {['A안', 'B안', 'C안', 'D안', '수정안', '최종안'].map(label => (
                  <button
                    key={label}
                    onClick={() => setForm(f => ({ ...f, version_label: label }))}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                      form.version_label === label
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <input
                  value={form.version_label}
                  onChange={e => setForm(f => ({ ...f, version_label: e.target.value }))}
                  placeholder="직접 입력"
                  maxLength={10}
                  className="h-7 w-24 border border-gray-200 rounded-lg px-2 text-xs text-center focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">동일 문의에 A안/B안 등 복수 견적 작성 시 구분 라벨</p>
            </section>

            {/* 행사 일수 전역 설정 */}
            <section>
              <SectionTitle step={3} label="행사 일수 설정" />
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg p-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-xs text-gray-500">전체 일수:</span>
                  <input
                    type="number" min={1} max={365}
                    value={form.event_days}
                    onChange={e => applyGlobalDays(Number(e.target.value))}
                    className="w-14 h-7 border border-gray-200 rounded px-1.5 text-sm text-center font-semibold"
                  />
                  <span className="text-xs text-gray-500">일</span>
                </div>
                {selectedInq?.event_start && (
                  <button
                    onClick={() => applyGlobalDays(autoDays)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${form.days_mode === 'auto' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-blue-50'}`}
                  >
                    📅 문의 기준 ({autoDays}일)
                  </button>
                )}
                {[1, 2, 3, 5, 7, 10].map(d => (
                  <button key={d} onClick={() => applyGlobalDays(d)}
                    className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${form.event_days === d ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {d}일
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">일수 변경 시 모든 품목에 일괄 적용됩니다.</p>
            </section>

            {/* 4. 공급받는자 정보 */}
            <section>
              <SectionTitle step={4} label="공급받는자 정보" />
              <div className="space-y-2.5">
                <div>
                  <label className="label-xs">현장 주소</label>
                  <Input value={form.site_address} onChange={e => setForm(f => ({ ...f, site_address: e.target.value }))} placeholder="행사 장소" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="label-xs">담당자</label>
                    <Input value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} placeholder="담당자명" />
                  </div>
                  <div>
                    <label className="label-xs">연락처</label>
                    <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="010-0000-0000" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="label-xs">복장</label>
                    <Input value={form.attire} onChange={e => setForm(f => ({ ...f, attire: e.target.value }))} placeholder="정장" />
                  </div>
                  <div>
                    <label className="label-xs">식사</label>
                    <Input value={form.meal} onChange={e => setForm(f => ({ ...f, meal: e.target.value }))} placeholder="미제공" />
                  </div>
                  <div>
                    <label className="label-xs">주차</label>
                    <Input value={form.parking} onChange={e => setForm(f => ({ ...f, parking: e.target.value }))} placeholder="가능" />
                  </div>
                </div>
                <div className="w-48">
                  <label className="label-xs">기타 부대비용 (원)</label>
                  <Input type="number" value={form.extra_cost} onChange={e => setForm(f => ({ ...f, extra_cost: Number(e.target.value) }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-2.5">
                <input type="checkbox" checked={form.include_vat} onChange={e => setForm(f => ({ ...f, include_vat: e.target.checked }))} className="w-4 h-4 rounded" />
                부가세 (VAT 10%) 포함
              </label>
            </section>

            {/* 5. 견적 품목 */}
            <section>
              <SectionTitle step={5} label="견적 품목" />
              {/* 빠른 추가 버튼 그룹 */}
              <div className="space-y-2 mb-3">
                <div className="flex gap-1.5 flex-wrap">
                  <QuickBtn color="blue"  onClick={() => addRow('인력')}   label="+ 인력" />
                  <QuickBtn color="blue"  onClick={() => addRow('연장수당', { role_name: '연장수당', work_time: '1H' })} label="+ 연장수당" />
                  <QuickBtn color="blue"  onClick={() => addRow('교통비',   { role_name: '교통비'   })} label="+ 교통비" />
                  <QuickBtn color="blue"  onClick={() => addRow('숙박비',   { role_name: '숙박비'   })} label="+ 숙박비" />
                </div>
                <div className="flex gap-1.5 flex-wrap items-center">
                  <span className="text-xs text-gray-400">식비:</span>
                  <QuickBtn color="amber" onClick={() => addMeal('provided')} label="의뢰사 제공" />
                  <QuickBtn color="amber" onClick={() => addMeal('cost')}     label="실비 (1만원)" />
                  <QuickBtn color="amber" onClick={addParking}                label="주차비(실비)" />
                </div>
                <div className="flex gap-1.5 flex-wrap items-center">
                  <Package className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span className="text-xs text-gray-400">본사지원:</span>
                  {SUPPORT_PRESETS.map(name => (
                    <QuickBtn key={name} color="sky" onClick={() => addSupport(name)} label={name === '직접입력' ? '+ 직접입력' : name} />
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="text-center py-4 text-gray-400 text-sm">직군 데이터 로딩 중...</div>
              ) : (
                <div className="space-y-2">
                  {items.map(row => (
                    <ItemRowCard
                      key={row.key} row={row} roles={roles}
                      factors={factors.filter(f => f.role_id === row.role_id)}
                      expandedFactor={expandedFactor}
                      defaultWorkTime={defaultWt}
                      onRoleSelect={id => handleRoleSelect(row.key, id)}
                      onLeaderToggle={() => handleLeaderToggle(row.key)}
                      onFactorToggle={fid => handleFactorToggle(row.key, fid)}
                      onUpdate={(field, val) => updateRow(row.key, field, val)}
                      onRemove={() => removeRow(row.key)}
                      onToggleFactor={() => setExpandedFactor(p => p === row.key ? null : row.key)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 6. 금액 요약 */}
            <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
              <SectionTitle step={6} label="금액 요약" />
              <div className="space-y-1.5 text-sm">
                <SumLine label="인력비 소계"   value={formatKRW(staffSubtotal)} />
                {extraSubtotal > 0 && <SumLine label="부대비용 소계" value={formatKRW(extraSubtotal)} />}
                {supportItems.length > 0 && <SumLine label="본사 지원품목" value={`${supportItems.length}종 (미청구)`} dimmed />}
                <SumLine label="공급가액" value={formatKRW(supplyPrice)} bold />
                {form.include_vat && <SumLine label="부가세 (10%)" value={formatKRW(vat)} />}
                <div className="flex justify-between font-bold text-blue-800 border-t border-blue-200 pt-2 text-base">
                  <span>청구 합계</span><span>{formatKRW(finalTotal)}</span>
                </div>
                <SumLine label="매입원가" value={formatKRW(costPrice)} dimmed />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">수익률 (인력)</span>
                  <span className={`font-bold ${staffRate >= 20 ? 'text-green-700' : staffRate >= 10 ? 'text-yellow-700' : 'text-red-600'}`}>{staffRate}%</span>
                </div>
                <button onClick={() => setRightTab('report')} className="w-full mt-1 text-xs text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 py-1 rounded-lg hover:bg-indigo-50 border border-indigo-100 transition-colors">
                  <BarChart3 className="h-3.5 w-3.5" />수익 리포트 상세 보기 →
                </button>
              </div>
            </section>

            {/* 7. 특이사항 */}
            <section>
              <SectionTitle step={7} label="특이사항 / 추가 안내" />
              <p className="text-xs text-gray-400 mb-1.5">견적서 하단 특이사항 박스에 표시됩니다.</p>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="예) · 행사 당일 진행상황에 따라 연장 발생 시 별도 협의&#10;· 2타임 분리 운영 시 교통비 별도 청구"
                rows={4}
              />
            </section>
          </div>
        </div>

        {/* ── 오른쪽: 탭 패널 ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 탭 헤더 */}
          <div className="flex bg-white border-b border-gray-200 shrink-0">
            <TabBtn active={rightTab === 'preview'} onClick={() => setRightTab('preview')} icon={<FileText className="h-3.5 w-3.5" />} label="A4 미리보기" />
            <TabBtn active={rightTab === 'report'}  onClick={() => setRightTab('report')}  icon={<BarChart3   className="h-3.5 w-3.5" />} label="수익 리포트" badge={staffRate > 0 ? `${staffRate}%` : undefined} />
          </div>

          {/* A4 미리보기 */}
          {rightTab === 'preview' && (
            <div className="flex-1 overflow-auto bg-gray-300 py-6 px-8">
              <p className="text-xs text-center text-gray-500 mb-3 select-none">입력 내용이 실시간으로 반영됩니다</p>
              <div
                ref={previewRef}
                style={{
                  width: '794px', minHeight: '1123px', margin: '0 auto',
                  padding: '48px 56px', backgroundColor: '#fff',
                  boxShadow: '0 4px 32px rgba(0,0,0,0.18)', borderRadius: '4px',
                  fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif",
                  fontSize: '12px', color: '#1a1a1a', lineHeight: '1.6',
                }}
              >
                <A4Preview
                  selectedInq={selectedInq} form={form}
                  staffItems={staffItems} extraItems={extraItems} supportItems={supportItems}
                  staffSubtotal={staffSubtotal} extraSubtotal={extraSubtotal}
                  supplyPrice={supplyPrice} vat={vat} finalTotal={finalTotal}
                  eventPeriod={eventPeriod} today={today}
                />
              </div>
            </div>
          )}

          {/* 수익 리포트 */}
          {rightTab === 'report' && (
            <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
              <ProfitReport
                reportRef={reportRef}
                staffItems={staffItems}
                staffBilling={staffBilling} staffCost={staffCost}
                staffProfit={staffProfit} staffRate={staffRate}
                supplyPrice={supplyPrice} costPrice={costPrice} finalTotal={finalTotal}
                extraSubtotal={extraSubtotal}
                memo={reportMemo} onMemoChange={(k, v) => setReportMemo(m => ({ ...m, [k]: v }))}
                companyName={selectedInq?.company_name || ''} eventName={selectedInq?.event_name || ''}
                eventPeriod={eventPeriod}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 탭 버튼 ──────────────────────────────────────────────
function TabBtn({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: string
}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${active ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
      {icon}{label}
      {badge && <span className={`text-xs px-1.5 py-0.5 rounded-full ml-0.5 ${active ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-700'}`}>{badge}</span>}
    </button>
  )
}

// ── 빠른 추가 버튼 ───────────────────────────────────────
function QuickBtn({ onClick, label, color }: { onClick: () => void; label: string; color: 'blue' | 'amber' | 'sky' }) {
  const cls = {
    blue:  'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    sky:   'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
  }[color]
  return (
    <button onClick={onClick} className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${cls}`}>{label}</button>
  )
}

// ── 공통 서브 컴포넌트 ───────────────────────────────────
function SectionTitle({ step, label }: { step: number; label: string }) {
  return (
    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2.5">
      <span className="w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center shrink-0">{step}</span>
      {label}
    </h4>
  )
}
function SumLine({ label, value, bold, dimmed }: { label: string; value: string; bold?: boolean; dimmed?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-bold text-gray-800' : ''} ${dimmed ? 'text-gray-400' : ''}`}>
      <span className="text-gray-500">{label}</span><span>{value}</span>
    </div>
  )
}

// ── 품목 행 카드 ─────────────────────────────────────────
type ItemRowCardProps = {
  row: ItemRow; roles: Role[]; factors: Factor[]; expandedFactor: string | null
  defaultWorkTime: string
  onRoleSelect: (id: string) => void; onLeaderToggle: () => void; onFactorToggle: (id: string) => void
  onUpdate: (f: keyof ItemRow, v: unknown) => void; onRemove: () => void; onToggleFactor: () => void
}
function ItemRowCard({ row, roles, factors, expandedFactor, defaultWorkTime, onRoleSelect, onLeaderToggle, onFactorToggle, onUpdate, onRemove, onToggleFactor }: ItemRowCardProps) {
  const subTotal  = row.quantity * row.days * row.unit_price
  const isExpanded = expandedFactor === row.key
  const isExtra   = EXTRA_TYPES.includes(row.item_type)
  const isSupport = SUPPORT_TYPES.includes(row.item_type)

  const [showTimePicker, setShowTimePicker] = useState(false)
  const [startT, setStartT] = useState('')
  const [endT,   setEndT]   = useState('')

  function applyTime(s: string, e: string) {
    if (!s || !e) return
    const [sh, sm] = s.split(':').map(Number)
    const [eh, em] = e.split(':').map(Number)
    const hrs = ((eh * 60 + em) - (sh * 60 + sm)) / 60
    if (hrs <= 0) return
    const label = `${s}~${e} (${hrs % 1 === 0 ? hrs : hrs.toFixed(1)}H)`
    onUpdate('work_time', label)
    setShowTimePicker(false); setStartT(''); setEndT('')
  }

  function applyHourPreset(h: string) {
    onUpdate('work_time', `${h} 기준`)
    setShowTimePicker(false)
  }

  const borderCls = isSupport ? 'border-sky-200' : isExtra ? 'border-amber-200' : 'border-gray-200'
  const bgCls     = isSupport ? 'bg-sky-50'     : isExtra ? 'bg-amber-50'     : 'bg-white'

  return (
    <div className={`border ${borderCls} rounded-lg ${bgCls} overflow-hidden text-xs`}>
      <div className="p-2.5 space-y-2">
        {/* 행 1: 유형 뱃지 + 이름 + 삭제 */}
        <div className="flex gap-1.5 items-center">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${isSupport ? 'bg-sky-200 text-sky-800' : isExtra ? 'bg-amber-200 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>
            {row.item_type}
          </span>
          {!isExtra && !isSupport && (
            <Select value={row.role_id} onChange={e => onRoleSelect(e.target.value)} className="h-7 text-xs flex-1">
              <option value="">직접 입력</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.role_name} ({r.base_price.toLocaleString()})</option>)}
            </Select>
          )}
          <Input
            value={row.role_name}
            onChange={e => onUpdate('role_name', e.target.value)}
            placeholder={isSupport ? '지원품명 (예: 무전기)' : isExtra ? '품명' : '직군명 / 업무'}
            className={`h-7 text-xs ${(!isExtra && !isSupport) ? 'w-28' : 'flex-1'}`}
          />
          <button onClick={onRemove} className="text-red-400 hover:text-red-600 shrink-0 ml-auto"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>

        {/* 시간/규격 (지원품목 제외) */}
        {!isSupport && (
          <div>
            <div className="flex gap-1.5 items-center">
              <Input
                value={row.work_time}
                onChange={e => onUpdate('work_time', e.target.value)}
                placeholder={isExtra ? '규격/상세' : defaultWorkTime ? `문의: ${defaultWorkTime}` : '시간 (예: 08:30~17:00 (8.5H))'}
                className="h-7 text-xs flex-1"
              />
              {!isExtra && (
                <button onClick={() => setShowTimePicker(p => !p)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 whitespace-nowrap shrink-0 flex items-center gap-1">
                  <Clock className="h-3 w-3" />시간
                </button>
              )}
            </div>
            {showTimePicker && !isExtra && (
              <div className="mt-1.5 p-2.5 rounded-lg bg-white border border-gray-200 shadow-sm space-y-2">
                {/* 문의 시간 자동 입력 */}
                {defaultWorkTime && (
                  <div>
                    <p className="text-gray-400 text-xs mb-1">문의 등록 시간</p>
                    <button onClick={() => { onUpdate('work_time', defaultWorkTime); setShowTimePicker(false) }}
                      className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 font-medium">
                      {defaultWorkTime} (문의에서 가져오기)
                    </button>
                  </div>
                )}
                {/* 기준 시간 */}
                <div>
                  <p className="text-gray-400 text-xs mb-1">기준 시간 (시간 미정 시)</p>
                  <div className="flex flex-wrap gap-1">
                    {HOUR_PRESETS.map(h => (
                      <button key={h} onClick={() => applyHourPreset(h)}
                        className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100">{h}</button>
                    ))}
                  </div>
                </div>
                {/* 시작/종료 시간 선택 */}
                <div>
                  <p className="text-gray-400 text-xs mb-1">시작/종료 직접 선택</p>
                  <div className="mb-1">
                    <span className="text-gray-500 text-xs">시작: </span>
                    {START_TIMES.map(t => (
                      <button key={t} onClick={() => { setStartT(t); if (endT) applyTime(t, endT) }}
                        className={`mr-1 mb-1 text-xs px-1.5 py-0.5 rounded ${startT === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}>{t}</button>
                    ))}
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">종료: </span>
                    {END_TIMES.map(t => (
                      <button key={t} onClick={() => { setEndT(t); if (startT) applyTime(startT, t) }}
                        className={`mr-1 mb-1 text-xs px-1.5 py-0.5 rounded ${endT === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 hover:bg-blue-50'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => setShowTimePicker(false)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
              </div>
            )}
          </div>
        )}

        {/* 수량 × 일수 × 단가 (지원품목 제외) */}
        {!isSupport && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <input type="number" min={1} value={row.quantity} onChange={e => onUpdate('quantity', Number(e.target.value))} className="w-12 h-7 border border-gray-200 rounded px-1.5 text-xs text-center" />
            <span className="text-gray-400">명 ×</span>
            <input type="number" min={1} value={row.days} onChange={e => onUpdate('days', Number(e.target.value))} className="w-10 h-7 border border-gray-200 rounded px-1.5 text-xs text-center" />
            <span className="text-gray-400">일</span>
            <div className="flex items-center gap-0.5 ml-1">
              <span className="text-gray-400">단가</span>
              <input type="number" value={row.unit_price} onChange={e => onUpdate('unit_price', Number(e.target.value))} className="w-20 h-7 border border-gray-200 rounded px-1.5 text-xs text-right" />
            </div>
            {!isExtra && (
              <div className="flex items-center gap-0.5">
                <span className="text-gray-400">지급</span>
                <input type="number" value={row.pay_unit_price} onChange={e => onUpdate('pay_unit_price', Number(e.target.value))} className="w-20 h-7 border border-gray-200 rounded px-1.5 text-xs text-right" />
              </div>
            )}
            <div className="ml-auto font-semibold text-blue-700 whitespace-nowrap">{formatKRW(subTotal)}</div>
          </div>
        )}

        {/* 비고 */}
        <input
          value={row.spec}
          onChange={e => onUpdate('spec', e.target.value)}
          placeholder={isSupport ? '본사 지원' : isExtra ? '비고' : '비고 (선택)'}
          className="w-full h-6 border border-gray-200 rounded px-1.5 text-xs"
        />

        {/* 인력 전용: 팀장 / 팩터 */}
        {!isExtra && !isSupport && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={onLeaderToggle} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${row.is_leader ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
              <Star className={`h-3 w-3 ${row.is_leader ? 'fill-yellow-500 text-yellow-500' : ''}`} />
              팀장{roles.find(r => r.id === row.role_id)?.leader_bonus ? ` (+${roles.find(r => r.id === row.role_id)!.leader_bonus.toLocaleString()})` : ''}
            </button>
            {factors.length > 0 && (
              <button onClick={onToggleFactor} className="flex items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                <Zap className="h-3 w-3" />
                가중치{row.selectedFactors.length > 0 ? ` (${row.selectedFactors.length})` : ''}
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 팩터 패널 */}
      {isExpanded && factors.length > 0 && (
        <div className="border-t border-gray-100 bg-indigo-50 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {factors.map(f => {
              const active = row.selectedFactors.includes(f.id)
              return (
                <button key={f.id} onClick={() => onFactorToggle(f.id)}
                  className={`px-2 py-1 rounded-full text-xs transition-colors ${active ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-100'}`}>
                  {f.factor_name} (+{f.add_price.toLocaleString()})
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 수익 리포트 컴포넌트 ──────────────────────────────────
interface ItemRow2 { key: string; role_name: string; quantity: number; days: number; unit_price: number; pay_unit_price: number; is_leader: boolean; item_type: ItemType; spec: string; selectedFactors: string[]; _basePrice: number; _basePayPrice: number; work_time: string; role_id: string }
function ProfitReport({
  reportRef,
  staffItems, staffBilling, staffCost, staffProfit, staffRate,
  supplyPrice, costPrice, finalTotal, extraSubtotal,
  memo, onMemoChange, companyName, eventName, eventPeriod,
}: {
  reportRef?: React.RefObject<HTMLDivElement | null>
  staffItems: ItemRow2[]
  staffBilling: number; staffCost: number; staffProfit: number; staffRate: number
  supplyPrice: number; costPrice: number; finalTotal: number; extraSubtotal: number
  memo: ReportMemo; onMemoChange: (k: keyof ReportMemo, v: string) => void
  companyName: string; eventName: string; eventPeriod: string
}) {
  const rateColor = staffRate >= 25 ? 'text-green-700' : staffRate >= 15 ? 'text-blue-700' : staffRate >= 10 ? 'text-yellow-700' : 'text-red-600'
  const rateBarW  = Math.min(100, Math.max(0, staffRate))

  return (
    <div ref={reportRef} className="max-w-3xl mx-auto space-y-5 pb-4">
      {/* 리포트 헤더 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-indigo-600" />수익 분석 리포트</h2>
            {(companyName || eventName) && <p className="text-sm text-gray-500 mt-1">{companyName} / {eventName} — {eventPeriod}</p>}
          </div>
          <span className="text-xs text-gray-400">{new Date().toLocaleDateString('ko-KR')} 기준</span>
        </div>
      </div>

      {/* KPI 카드 3개 */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="총 청구" value={formatKRW(staffBilling)} sub={`부대비용 ${formatKRW(extraSubtotal)} 별도`} color="blue" />
        <KpiCard label="총 지급 (인력)" value={formatKRW(staffCost)} sub={`합계 ${formatKRW(costPrice)}`} color="red" />
        <KpiCard label="순이익 (인력)" value={formatKRW(staffProfit)} sub={`이익률 ${staffRate}%`} color="green" highlight />
      </div>

      {/* 이익률 시각 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-gray-700">인력 이익률</span>
          <span className={`text-2xl font-black ${rateColor}`}>{staffRate}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rateBarW}%`, background: staffRate >= 25 ? '#16a34a' : staffRate >= 15 ? '#2563eb' : staffRate >= 10 ? '#ca8a04' : '#dc2626' }} />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>기준 15%</span><span>30%+</span></div>
        <p className="text-xs text-gray-400 mt-2">※ 부대비용(교통/숙박/식비 등)은 실비 처리 — 이익률 계산 제외</p>
      </div>

      {/* 품목별 마진 테이블 */}
      {staffItems.filter(r => r.role_name).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-semibold text-sm text-gray-700">품목별 마진 상세</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800 text-white">
                  {['품목', '일', '명', '청구단가', '지급단가', '마진', '청구합계', '지급합계', '순이익', '이익률'].map((h, i) => (
                    <th key={h} className="px-3 py-2 text-right first:text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffItems.filter(r => r.role_name).map((row, idx) => {
                  const billing = row.quantity * row.days * row.unit_price
                  const cost    = row.quantity * row.days * row.pay_unit_price
                  const profit  = billing - cost
                  const rate    = billing > 0 ? Math.round((profit / billing) * 1000) / 10 : 0
                  const margin  = row.unit_price - row.pay_unit_price
                  return (
                    <tr key={row.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 font-medium">{row.is_leader ? '★ ' : ''}{row.role_name}{row.work_time ? <span className="ml-1 text-gray-400">({row.work_time})</span> : null}</td>
                      <td className="px-3 py-2 text-right">{row.days}일</td>
                      <td className="px-3 py-2 text-right">{row.quantity}명</td>
                      <td className="px-3 py-2 text-right">{row.unit_price.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{row.pay_unit_price.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${margin > 0 ? 'text-blue-600' : 'text-red-600'}`}>{margin.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{billing.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-red-600">{cost.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-bold text-green-700">{profit.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-bold ${rate >= 20 ? 'text-green-700' : rate >= 10 ? 'text-yellow-700' : 'text-red-600'}`}>{rate}%</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-900 text-white font-bold">
                  <td className="px-3 py-2" colSpan={6}>합 계</td>
                  <td className="px-3 py-2 text-right">{staffBilling.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-red-300">{staffCost.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-green-300">{staffProfit.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right ${staffRate >= 20 ? 'text-green-300' : staffRate >= 10 ? 'text-yellow-300' : 'text-red-300'}`}>{staffRate}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 내부 메모 4칸 */}
      <div className="grid grid-cols-2 gap-4">
        {([
          { key: 'strategy',   label: '1. 전략',   placeholder: '예) 지난번 행사 동일 운영, 수요일 연장근무 확정은 아직...' },
          { key: 'staff',      label: '2. 인력',   placeholder: '예) 이전 근무자 우선 배치, 경험자 위주 선발...' },
          { key: 'special',    label: '3. 특이',   placeholder: '예) 식비는 추가근무 하는 날만 청구...' },
          { key: 'conclusion', label: '4. 결론',   placeholder: '예) 이익률 목표 20% 이상, 선금 협의 필요...' },
        ] as const).map(({ key, label, placeholder }) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
            <Textarea
              value={memo[key]}
              onChange={e => onMemoChange(key, e.target.value)}
              placeholder={placeholder}
              rows={4}
              className="text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color, highlight }: { label: string; value: string; sub: string; color: 'blue' | 'red' | 'green'; highlight?: boolean }) {
  const bg   = { blue: 'bg-blue-600', red: 'bg-red-500', green: 'bg-emerald-600' }[color]
  const ring = highlight ? 'ring-2 ring-emerald-300 ring-offset-2' : ''
  return (
    <div className={`${bg} ${ring} text-white rounded-xl p-4 shadow-sm`}>
      <p className="text-white/80 text-xs font-medium">{label}</p>
      <p className="text-xl font-black mt-1 truncate">{value}</p>
      <p className="text-white/60 text-xs mt-1">{sub}</p>
    </div>
  )
}

// ── A4 미리보기 (별도 컴포넌트로 분리) ──────────────────
type ItemRowSimple = { key: string; role_name: string; quantity: number; days: number; unit_price: number; pay_unit_price: number; is_leader: boolean; item_type: ItemType; spec: string; work_time: string }
function A4Preview({
  selectedInq, form, staffItems, extraItems, supportItems,
  staffSubtotal, extraSubtotal, supplyPrice, vat, finalTotal,
  eventPeriod, today,
}: {
  selectedInq?: Inquiry; form: { manager: string; contact_phone: string; site_address: string; attire: string; meal: string; parking: string; notes: string; include_vat: boolean }
  staffItems: ItemRowSimple[]; extraItems: ItemRowSimple[]; supportItems: ItemRowSimple[]
  staffSubtotal: number; extraSubtotal: number; supplyPrice: number; vat: number; finalTotal: number
  eventPeriod: string; today: string
}) {
  return (
    <>
      {/* 제목 */}
      <div style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #1e3a5f' }}>
        <div style={{ fontSize: '34px', fontWeight: '900', letterSpacing: '16px', color: '#1e3a5f', marginBottom: '4px' }}>견 적 서</div>
        
      </div>

      {/* 공급받는자 / 공급자 테이블 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', fontSize: '11px' }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top', width: '50%', paddingRight: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #1e3a5f' }}>
                <tbody>
                  <TblHeader label="공급받는자" />
                  <TblRow2 l1="상호" v1={selectedInq?.company_name || '(업체명)'} l2="담당" v2={form.manager || ''} />
                  <TblRow2 l1="연락처" v1={form.contact_phone || ''} l2="" v2="" />
                  <TblRow2 l1="주소" v1={form.site_address || ''} l2="" v2="" />
                  <TblRow2 l1="행사일시" v1={eventPeriod} l2="" v2="" />
                </tbody>
              </table>
            </td>
            <td style={{ verticalAlign: 'top', width: '50%', paddingLeft: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #1e3a5f' }}>
                <tbody>
                  <TblHeader label="공급자" />
                  <TblRow2 l1="등록번호" v1={CO.regNo} l2="" v2="" />
                  <TblRow2 l1="상호" v1={CO.name} l2="성명" v2={CO.ceo} />
                  <TblRow2 l1="주소" v1={CO.address} l2="" v2="" />
                  <TblRow2 l1="전화" v1={CO.phone} l2="견적일" v2={today} />
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 합계금액 한글 */}
      <div style={{
        textAlign: 'center', margin: '0 0 18px',
        padding: '13px 0', fontSize: '14px', fontWeight: '800', color: '#1e3a5f',
        border: '2px solid #1e3a5f', borderRadius: '6px', backgroundColor: '#f0f4ff',
      }}>
        합계금액 : 일금&nbsp;
        <span style={{ textDecoration: 'underline', color: '#dc2626', fontWeight: '900' }}>
          {supplyPrice > 0 ? toKoreanAmount(finalTotal) : '( 품목 입력 후 자동 표시 )'}
        </span>
        &nbsp;<span style={{ color: '#6b7280', fontWeight: '400', fontSize: '11px' }}>
          {form.include_vat ? '(부가세 포함)' : '(부가세 별도)'}
        </span>
      </div>

      {/* 결제 / 계약 안내 */}
      <div style={{ marginBottom: '18px', border: '1px solid #d1d5db', borderRadius: '4px', overflow: 'hidden', fontSize: '10.5px' }}>
        <div style={{ backgroundColor: '#f3f4f6', padding: '6px 12px', fontWeight: '700', borderBottom: '1px solid #d1d5db' }}>1. 결제사항</div>
        <div style={{ padding: '8px 12px', lineHeight: '1.9' }}>
          <div>행사시작 2주 전 선금 50% | 행사 종료 후 1주 이내 잔금 50%</div>
          <div style={{ color: '#6b7280' }}>※ 견적은 상황에 따라 변동될 수 있습니다.</div>
        </div>
        <div style={{ backgroundColor: '#f3f4f6', padding: '6px 12px', fontWeight: '700', borderTop: '1px solid #d1d5db', borderBottom: '1px solid #d1d5db' }}>2. 계약 확정 안내</div>
        <div style={{ padding: '8px 12px', lineHeight: '1.9' }}>
          <div>우수한 인력 확보 및 행사 품질 유지를 위해 행사일 기준 <strong>3주 전 계약을 권장</strong>합니다.</div>
          <div style={{ color: '#6b7280' }}>※ 부득이한 경우라도 최소 2주 전까지는 저희 쪽에 통지해 주시기 바랍니다.</div>
        </div>
      </div>

      {/* 품목 테이블 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11px' }}>
        <thead>
          <tr style={{ backgroundColor: '#1e3a5f', color: '#fff' }}>
            {['품명', '시간/규격', '수량', '일수', '단가', '금액', '비고'].map((h) => (
              <th key={h} style={{ padding: '9px 8px', textAlign: 'center', verticalAlign: 'middle', fontWeight: '700', fontSize: '11px', border: '1px solid #2d4a7a', lineHeight: '1.2' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staffItems.filter(r => r.role_name).map((row, idx) => {
            const amt = row.quantity * row.days * row.unit_price
            return (
              <tr key={row.key} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px 8px', border: '1px solid #e5e7eb', fontWeight: row.is_leader ? '700' : '500', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.is_leader ? '★ ' : ''}{row.role_name}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #e5e7eb', color: '#4b5563', fontSize: '10px', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.work_time}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #e5e7eb', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.quantity}명</td>
                <td style={{ padding: '8px 8px', border: '1px solid #e5e7eb', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.days}일</td>
                <td style={{ padding: '8px 8px', border: '1px solid #e5e7eb', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.unit_price.toLocaleString()}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #e5e7eb', textAlign: 'center', fontWeight: '700', color: '#1e3a5f', verticalAlign: 'middle', lineHeight: '1.2' }}>{amt.toLocaleString()}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #e5e7eb', fontSize: '10px', color: '#6b7280', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.spec}</td>
              </tr>
            )
          })}
          {staffItems.filter(r => r.role_name).length > 0 && (
            <tr style={{ backgroundColor: '#eef2ff' }}>
              <td colSpan={5} style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '700', border: '1px solid #c7d2fe', color: '#3730a3' }}>소계</td>
              <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '800', border: '1px solid #c7d2fe', color: '#1e40af', fontSize: '12px' }}>{staffSubtotal.toLocaleString()}</td>
              <td style={{ border: '1px solid #c7d2fe' }} />
            </tr>
          )}
          {extraItems.filter(r => r.role_name).map((row) => {
            const amt = row.quantity * row.days * row.unit_price
            return (
              <tr key={row.key} style={{ backgroundColor: '#fef9c3', borderBottom: '1px solid #fde68a' }}>
                <td style={{ padding: '8px 8px', border: '1px solid #fde68a', fontWeight: '600', color: '#92400e', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.role_name || row.item_type}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #fde68a', color: '#92400e', fontSize: '10px', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.work_time}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #fde68a', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.quantity}명</td>
                <td style={{ padding: '8px 8px', border: '1px solid #fde68a', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.days}일</td>
                <td style={{ padding: '8px 8px', border: '1px solid #fde68a', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.unit_price > 0 ? row.unit_price.toLocaleString() : '-'}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #fde68a', textAlign: 'center', fontWeight: '700', verticalAlign: 'middle', lineHeight: '1.2' }}>{amt > 0 ? amt.toLocaleString() : '-'}</td>
                <td style={{ padding: '8px 8px', border: '1px solid #fde68a', fontSize: '10px', color: '#92400e', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.spec}</td>
              </tr>
            )
          })}
          {extraItems.filter(r => r.role_name).length > 0 && (
            <tr style={{ backgroundColor: '#fef3c7' }}>
              <td colSpan={5} style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '700', border: '1px solid #fde68a', color: '#92400e' }}>부대비용 합계</td>
              <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: '800', border: '1px solid #fde68a', color: '#92400e' }}>{extraSubtotal.toLocaleString()}</td>
              <td style={{ border: '1px solid #fde68a' }} />
            </tr>
          )}
          {supportItems.filter(r => r.role_name).map((row) => (
            <tr key={row.key} style={{ backgroundColor: '#e0f2fe', borderBottom: '1px solid #bae6fd' }}>
              <td style={{ padding: '8px 8px', border: '1px solid #bae6fd', color: '#0369a1', verticalAlign: 'middle', lineHeight: '1.2' }}>
                <span style={{ fontSize: '9px', backgroundColor: '#0284c7', color: '#fff', padding: '1px 5px', borderRadius: '3px', marginRight: '5px' }}>지원</span>
                {row.role_name}
              </td>
              <td style={{ padding: '8px 8px', border: '1px solid #bae6fd', fontSize: '10px', color: '#0369a1', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.work_time}</td>
              <td style={{ padding: '8px 8px', border: '1px solid #bae6fd', textAlign: 'center', color: '#0369a1', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.quantity}명</td>
              <td style={{ padding: '8px 8px', border: '1px solid #bae6fd', textAlign: 'center', color: '#0369a1', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.days}일</td>
              <td style={{ padding: '8px 8px', border: '1px solid #bae6fd', textAlign: 'center', color: '#0369a1', verticalAlign: 'middle', lineHeight: '1.2' }}>-</td>
              <td style={{ padding: '8px 8px', border: '1px solid #bae6fd', textAlign: 'center', fontWeight: '600', color: '#0369a1', verticalAlign: 'middle', lineHeight: '1.2' }}>-</td>
              <td style={{ padding: '8px 8px', border: '1px solid #bae6fd', fontSize: '10px', color: '#0369a1', textAlign: 'center', verticalAlign: 'middle', lineHeight: '1.2' }}>{row.spec || '본사 지원'}</td>
            </tr>
          ))}
          <tr style={{ backgroundColor: '#1e3a5f' }}>
            <td colSpan={5} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '800', color: '#fff', fontSize: '12px', border: '1px solid #2d4a7a' }}>총 합계</td>
            <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '900', color: '#fff', fontSize: '13px', border: '1px solid #2d4a7a' }}>{supplyPrice.toLocaleString()}</td>
            <td style={{ border: '1px solid #2d4a7a' }} />
          </tr>
        </tbody>
      </table>

      {/* 하단: 근무비용 + 금액계산 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '4px', overflow: 'hidden', fontSize: '10.5px' }}>
          <div style={{ backgroundColor: '#f3f4f6', padding: '6px 12px', fontWeight: '700', fontSize: '11px', borderBottom: '1px solid #d1d5db' }}>3. 근무 비용 및 기준</div>
          <div style={{ padding: '9px 12px', lineHeight: '1.9', color: '#374151' }}>
            <p>- 계약시급 기준 / 계약 이후 추가시간 발생 시 시간당 추가 금액 별도 청구</p>
            <p>- 경호원 &amp; 경비지도사 : 30,000원 (VAT 별도) · STAFF : 20,000원 (VAT 별도)</p>
            <p>- 복리후생비, 일반관리비, 직책수당 단가 포함</p>
          </div>
        </div>
        <div style={{ width: '210px', border: '2px solid #1e3a5f', borderRadius: '4px', overflow: 'hidden' }}>
          <DocSumRow label="공급가액" value={supplyPrice.toLocaleString()} />
          <DocSumRow label="부 가 세" value={form.include_vat ? vat.toLocaleString() : '별도'} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', backgroundColor: '#1e3a5f', color: '#fff', fontWeight: '900', fontSize: '14px' }}>
            <span>합 계</span><span>{finalTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
      {form.notes && (
        <div style={{ marginBottom: '16px', border: '1px solid #fde68a', borderRadius: '4px', backgroundColor: '#fffbeb', padding: '10px 14px', fontSize: '11px' }}>
          <div style={{ fontWeight: '700', marginBottom: '5px', color: '#92400e' }}>※ 특이사항</div>
          <div style={{ color: '#451a03', whiteSpace: 'pre-wrap', lineHeight: '1.8' }}>{form.notes}</div>
        </div>
      )}
      <div style={{ textAlign: 'center', padding: '10px 16px', border: '2px solid #1e40af', borderRadius: '6px', backgroundColor: '#eff6ff', fontSize: '12px', fontWeight: '700', color: '#1e40af', marginBottom: '18px' }}>
        입금계좌: {CO.bank} {CO.bankAccount} (예금주: {CO.bankHolder})
      </div>
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/banner.png" alt="배너" crossOrigin="anonymous" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '4px' }} />
      </div>
    </>
  )
}


// A4 전용 미니 컴포넌트
function TblHeader({ label }: { label: string }) {
  return (
    <tr style={{ backgroundColor: '#1e3a5f', color: '#fff' }}>
      <td colSpan={4} style={{ padding: '6px 10px', fontWeight: '700', fontSize: '11px', textAlign: 'center', border: '1px solid #2d4a7a', letterSpacing: '1px' }}>{label}</td>
    </tr>
  )
}
function TblRow2({ l1, v1, l2, v2 }: { l1: string; v1: string; l2: string; v2: string }) {
  return (
    <tr>
      <td style={{ padding: '5px 8px', backgroundColor: '#f3f4f6', fontWeight: '600', fontSize: '10px', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: '58px', color: '#374151' }}>{l1}</td>
      <td style={{ padding: '5px 8px', fontSize: '10.5px', border: '1px solid #d1d5db', color: '#111827' }} colSpan={l2 ? 1 : 3}>{v1}</td>
      {l2 && <>
        <td style={{ padding: '5px 8px', backgroundColor: '#f3f4f6', fontWeight: '600', fontSize: '10px', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: '50px', color: '#374151' }}>{l2}</td>
        <td style={{ padding: '5px 8px', fontSize: '10.5px', border: '1px solid #d1d5db', color: '#111827' }}>{v2}</td>
      </>}
    </tr>
  )
}
function DocSumRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid #e5e7eb', fontSize: '12px' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: '700', color: '#111827' }}>{value}</span>
    </div>
  )
}
