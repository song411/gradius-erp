'use client'

import { useRef, useState } from 'react'
import { calcVAT, toKoreanAmount } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose } from '@/components/ui/dialog'
import { Download, Printer, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Estimate, EstimateItem, Inquiry } from '@/lib/supabase/types'
import { db } from '@/lib/supabase/api'

// ── 공급자 정보 (EstimateBuilder와 동일) ─────────────────
const CO = {
  name: '주식회사 가디어스', ceo: '최규성',
  regNo: '429-88-01469', address: '서울시 종로구 동망산1길 2, 1층',
  phone: '1600-2944', bank: '기업은행',
  bankAccount: '132-119648-04-019', bankHolder: '주식회사 가디어스',
}

const EXTRA_TYPES = ['교통비', '숙박비', '식비', '연장수당', '기타']
const SUPPORT_TYPES = ['지원품목']

interface Props {
  open: boolean
  onClose: () => void
  estimate: (Estimate & { estimate_items?: EstimateItem[]; inquiries?: Inquiry }) | null
  onStatusChange?: () => void
}

export default function EstimatePreview({ open, onClose, estimate, onStatusChange }: Props) {
  const docRef      = useRef<HTMLDivElement>(null)
  const [exporting, setExporting]     = useState(false)
  const [markingSent, setMarkingSent] = useState(false)

  if (!estimate) return null

  // ── 품목 분류 ──────────────────────────────────────────
  const allItems   = estimate.estimate_items || []
  const staffItems  = allItems.filter(i => !EXTRA_TYPES.includes(i.item_type || '') && !SUPPORT_TYPES.includes(i.item_type || ''))
  const extraItems  = allItems.filter(i =>  EXTRA_TYPES.includes(i.item_type || ''))
  const supportItems = allItems.filter(i => SUPPORT_TYPES.includes(i.item_type || ''))

  // ── 금액 ───────────────────────────────────────────────
  const supplyPrice   = estimate.supply_price || 0
  const vat           = estimate.vat || 0
  const total         = estimate.total_price || supplyPrice + vat
  const hasVat        = vat > 0
  const staffSubtotal = staffItems.reduce((s, i) => s + i.quantity * i.days * i.unit_price, 0)
  const extraSubtotal = extraItems.reduce((s, i) => s + i.quantity * i.days * i.unit_price, 0)

  // ── 날짜/기간 ──────────────────────────────────────────
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')

  const inq         = estimate.inquiries
  const eventStart  = inq?.event_start?.slice(0, 10) || ''
  const eventEnd    = inq?.event_end?.slice(0, 10) || ''
  const eventPeriod = eventStart
    ? (eventEnd && eventEnd !== eventStart ? `${eventStart} ~ ${eventEnd}` : eventStart)
    : '-'

  // ── 이미지 저장 ────────────────────────────────────────
  async function handleSaveImage() {
    if (!docRef.current) return
    setExporting(true)
    try {
      const h2c = (await import('html2canvas')).default
      const canvas = await h2c(docRef.current, { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false })
      const link = document.createElement('a')
      link.download = `견적서_${estimate?.company_name || ''}_${estimate?.estimate_code || ''}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally { setExporting(false) }
  }

  // ── 인쇄 ───────────────────────────────────────────────
  function handlePrint() {
    if (!docRef.current) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>견적서</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#fff}@media print{@page{size:A4;margin:10mm}}</style></head><body>${docRef.current.outerHTML}</body></html>`)
    win.document.close(); win.print()
  }

  // ── 발송 완료 처리 ─────────────────────────────────────
  async function handleMarkSent() {
    if (!estimate?.id) return
    setMarkingSent(true)
    try {
      await db.update('estimates', estimate.id, {
        send_status: '발송완료',
        sent_at: new Date().toISOString(),
        send_method: '이미지',
      })
      toast.success('발송 완료로 처리되었습니다.')
      onStatusChange?.()
    } catch {
      toast.error('상태 변경에 실패했습니다.')
    } finally { setMarkingSent(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-[900px] w-full">
      <DialogHeader>
        <DialogTitle className="text-sm">
          견적서 미리보기
          {estimate.estimate_code && (
            <span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
              {estimate.estimate_code}
            </span>
          )}
          {estimate.company_name && (
            <span className="ml-2 text-gray-400 font-normal">— {estimate.company_name}</span>
          )}
        </DialogTitle>
        <div className="flex items-center gap-2 ml-auto mr-8">
          {estimate.send_status !== '발송완료' && (
            <Button variant="outline" size="sm" onClick={handleMarkSent} disabled={markingSent}
              className="gap-1 text-green-600 border-green-200 hover:bg-green-50">
              <CheckCircle className="h-3.5 w-3.5" />
              발송 완료
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1">
            <Printer className="h-3.5 w-3.5" />인쇄
          </Button>
          <Button size="sm" onClick={handleSaveImage} disabled={exporting} className="gap-1">
            <Download className="h-3.5 w-3.5" />
            {exporting ? '저장 중...' : '이미지 저장'}
          </Button>
        </div>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <DialogContent className="p-0 bg-gray-300">
        <div className="overflow-y-auto max-h-[85vh] py-6 px-4">
          {/* A4 문서 — EstimateBuilder의 A4Preview와 동일한 레이아웃 */}
          <div
            ref={docRef}
            style={{
              width: '794px', minHeight: '1123px', margin: '0 auto',
              padding: '40px 48px', backgroundColor: '#fff',
              boxShadow: '0 4px 32px rgba(0,0,0,0.18)', borderRadius: '4px',
              fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif",
              fontSize: '12px', color: '#1a1a1a', lineHeight: '1.5',
            }}
          >
            {/* 제목 + 굵은 이중선 */}
            <div style={{ textAlign: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '4px solid #111' }}>
              <div style={{ fontSize: '32px', fontWeight: '900', letterSpacing: '14px', color: '#111', marginBottom: '2px' }}>견 적 서</div>
              <div style={{ height: '1.5px', backgroundColor: '#111', marginTop: '8px' }} />
            </div>

            {/* 공급받는자 / 공급자 2단 테이블 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '11px' }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'top', width: '50%', paddingRight: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #374151' }}>
                      <tbody>
                        <TblHeader label="공급받는자" />
                        <TblRow2 l1="상호"   v1={estimate.company_name || '(업체명)'} l2="참조"  v2={estimate.manager || ''} />
                        <TblRow2 l1="연락처" v1={''} l2="" v2="" />
                        <TblRow2 l1="주소"   v1={estimate.site_address || ''} l2="" v2="" />
                        <TblRow2 l1="행사일시" v1={eventPeriod} l2="" v2="" />
                      </tbody>
                    </table>
                  </td>
                  <td style={{ verticalAlign: 'top', width: '50%', paddingLeft: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #374151' }}>
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

            {/* 결제사항 + 계약확정안내 */}
            <div style={{ marginBottom: '14px', border: '1px solid #d1d5db', borderRadius: '4px', overflow: 'hidden', fontSize: '11px' }}>
              <div style={{ backgroundColor: '#f3f4f6', padding: '5px 10px', fontWeight: '700', borderBottom: '1px solid #d1d5db' }}>1. 결제사항</div>
              <div style={{ padding: '7px 10px', lineHeight: '1.8' }}>
                <div>행사시작 2주 전 선금 50% | 행사 종료 후 1주 이내 잔금 50%</div>
                <div style={{ color: '#6b7280' }}>※ 견적은 상황에 따라 변동될 수 있습니다.</div>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '5px 10px', fontWeight: '700', borderTop: '1px solid #d1d5db', borderBottom: '1px solid #d1d5db' }}>2. 계약 확정 안내</div>
              <div style={{ padding: '7px 10px', lineHeight: '1.8' }}>
                <div>우수한 인력 확보 및 행사 품질 유지를 위해 행사일 기준 <strong>3주 전 계약을 권장</strong>합니다.</div>
                <div style={{ color: '#6b7280' }}>※ 부득이한 경우라도 최소 2주 전까지는 저희 쪽에 통지해 주시기 바랍니다.</div>
              </div>
            </div>

            {/* 합계금액 한글 */}
            <div style={{
              textAlign: 'center', margin: '14px 0', padding: '10px 0',
              fontSize: '13px', fontWeight: '700', color: '#1e3a5f',
              border: '1.5px solid #1e3a5f', borderRadius: '4px', backgroundColor: '#f0f4ff',
            }}>
              합계금액 : 일금&nbsp;
              <span style={{ textDecoration: 'underline', color: '#dc2626', fontWeight: '800' }}>
                {supplyPrice > 0 ? toKoreanAmount(total) : '( 품목 없음 )'}
              </span>
              &nbsp;<span style={{ color: '#6b7280', fontWeight: '400', fontSize: '11px' }}>
                {hasVat ? '(부가세 포함)' : '(부가세 별도)'}
              </span>
            </div>

            {/* 품목 테이블 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#374151', color: '#fff' }}>
                  {['품명', '시간/규격', '수량', '일수', '단가', '금액', '비고'].map((h, i) => (
                    <th key={h} style={{ padding: '7px 6px', textAlign: i < 2 ? 'left' : 'right', fontWeight: '600', border: '1px solid #4b5563' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 인력 품목 */}
                {staffItems.filter(r => r.role_name).map((item, idx) => {
                  const amt = item.quantity * item.days * item.unit_price
                  // spec = "work_time / 비고" 형식으로 저장됨
                  const [workTime, ...specRest] = (item.spec || '').split(' / ')
                  const note = specRest.join(' / ')
                  return (
                    <tr key={item.id || idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '7px 6px', border: '1px solid #e5e7eb', fontWeight: item.is_leader ? '700' : '500' }}>{item.is_leader ? '★ ' : ''}{item.role_name}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: '10px' }}>{workTime}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #e5e7eb', textAlign: 'right' }}>{item.quantity}명</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #e5e7eb', textAlign: 'right' }}>{item.days}일</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #e5e7eb', textAlign: 'right' }}>{item.unit_price.toLocaleString()}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: '600' }}>{amt.toLocaleString()}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #e5e7eb', fontSize: '10px', color: '#6b7280' }}>{note}</td>
                    </tr>
                  )
                })}
                {staffItems.filter(r => r.role_name).length > 0 && (
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <td colSpan={5} style={{ padding: '6px', textAlign: 'right', fontWeight: '700', border: '1px solid #e5e7eb', fontSize: '11px' }}>소계</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: '700', border: '1px solid #e5e7eb', color: '#1e40af' }}>{staffSubtotal.toLocaleString()}</td>
                    <td style={{ border: '1px solid #e5e7eb' }} />
                  </tr>
                )}
                {/* 부대비용 (노란 배경) */}
                {extraItems.filter(r => r.role_name).map((item) => {
                  const amt = item.quantity * item.days * item.unit_price
                  const [workTime, ...specRest] = (item.spec || '').split(' / ')
                  const note = specRest.join(' / ')
                  return (
                    <tr key={item.id} style={{ backgroundColor: '#fef9c3', borderBottom: '1px solid #fde68a' }}>
                      <td style={{ padding: '7px 6px', border: '1px solid #fde68a', fontWeight: '600', color: '#92400e' }}>{item.role_name}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #fde68a', fontSize: '10px', color: '#92400e' }}>{workTime}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #fde68a', textAlign: 'right' }}>{item.quantity}명</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #fde68a', textAlign: 'right' }}>{item.days}일</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #fde68a', textAlign: 'right' }}>{item.unit_price > 0 ? item.unit_price.toLocaleString() : '-'}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #fde68a', textAlign: 'right', fontWeight: '600' }}>{amt > 0 ? amt.toLocaleString() : '-'}</td>
                      <td style={{ padding: '7px 6px', border: '1px solid #fde68a', fontSize: '10px', color: '#92400e' }}>{note}</td>
                    </tr>
                  )
                })}
                {extraItems.filter(r => r.role_name).length > 0 && (
                  <tr style={{ backgroundColor: '#fef3c7' }}>
                    <td colSpan={5} style={{ padding: '6px', textAlign: 'right', fontWeight: '700', border: '1px solid #fde68a', fontSize: '11px', color: '#92400e' }}>부대비용 합계</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: '700', border: '1px solid #fde68a', color: '#92400e' }}>{extraSubtotal.toLocaleString()}</td>
                    <td style={{ border: '1px solid #fde68a' }} />
                  </tr>
                )}
                {/* 지원품목 (파란 배경) */}
                {supportItems.filter(r => r.role_name).map((item) => (
                  <tr key={item.id} style={{ backgroundColor: '#e0f2fe', borderBottom: '1px solid #bae6fd' }}>
                    <td style={{ padding: '7px 6px', border: '1px solid #bae6fd', color: '#0369a1' }}>
                      <span style={{ fontSize: '9px', backgroundColor: '#0284c7', color: '#fff', padding: '1px 4px', borderRadius: '3px', marginRight: '4px' }}>지원</span>
                      {item.role_name}
                    </td>
                    <td style={{ padding: '7px 6px', border: '1px solid #bae6fd', fontSize: '10px', color: '#0369a1' }}>{item.spec}</td>
                    <td style={{ padding: '7px 6px', border: '1px solid #bae6fd', textAlign: 'right', color: '#0369a1' }}>{item.quantity}명</td>
                    <td style={{ padding: '7px 6px', border: '1px solid #bae6fd', textAlign: 'right', color: '#0369a1' }}>{item.days}일</td>
                    <td style={{ padding: '7px 6px', border: '1px solid #bae6fd', textAlign: 'right', color: '#0369a1' }}>-</td>
                    <td style={{ padding: '7px 6px', border: '1px solid #bae6fd', textAlign: 'right', color: '#0369a1', fontWeight: '600' }}>-</td>
                    <td style={{ padding: '7px 6px', border: '1px solid #bae6fd', fontSize: '10px', color: '#0369a1' }}>본사 지원</td>
                  </tr>
                ))}
                {/* 총 합계 */}
                <tr style={{ backgroundColor: '#1e3a5f' }}>
                  <td colSpan={5} style={{ padding: '8px 6px', textAlign: 'right', fontWeight: '800', color: '#fff', fontSize: '12px', border: '1px solid #1e3a5f' }}>총 합계</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: '800', color: '#fff', fontSize: '12px', border: '1px solid #1e3a5f' }}>{supplyPrice.toLocaleString()}</td>
                  <td style={{ border: '1px solid #1e3a5f' }} />
                </tr>
              </tbody>
            </table>

            {/* 근무 비용 및 기준 + 금액 요약 */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
              <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '4px', overflow: 'hidden', fontSize: '10.5px' }}>
                <div style={{ backgroundColor: '#f3f4f6', padding: '5px 10px', fontWeight: '700', fontSize: '11px', borderBottom: '1px solid #d1d5db' }}>3. 근무 비용 및 기준</div>
                <div style={{ padding: '8px 10px', lineHeight: '1.8', color: '#374151' }}>
                  <p>- 계약시급 기준 / 계약 이후 추가시간 발생 시 시간당 추가 금액 별도 청구</p>
                  <p>- 경호원 &amp; 경비지도사 : 30,000원 (VAT 별도) · STAFF : 20,000원 (VAT 별도)</p>
                  <p>- 복리후생비, 일반관리비, 직책수당 단가 포함</p>
                </div>
              </div>
              <div style={{ width: '200px', border: '1px solid #d1d5db', borderRadius: '4px', overflow: 'hidden' }}>
                <DocSumRow label="공급가액" value={supplyPrice.toLocaleString()} />
                <DocSumRow label="부 가 세" value={hasVat ? vat.toLocaleString() : '별도'} />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#1e3a5f', color: '#fff', fontWeight: '800', fontSize: '13px' }}>
                  <span>합 계</span><span>{total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* 특이사항 */}
            {estimate.notes && (
              <div style={{ marginBottom: '14px', border: '1px solid #fde68a', borderRadius: '4px', backgroundColor: '#fffbeb', padding: '8px 12px', fontSize: '11px' }}>
                <div style={{ fontWeight: '700', marginBottom: '5px', color: '#92400e' }}>※ 특이사항</div>
                <div style={{ color: '#451a03', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{estimate.notes}</div>
              </div>
            )}

            {/* 입금 계좌 */}
            <div style={{ textAlign: 'center', padding: '8px 16px', border: '1.5px solid #1e40af', borderRadius: '4px', backgroundColor: '#eff6ff', fontSize: '12px', fontWeight: '600', color: '#1e40af', marginBottom: '16px' }}>
              입금계좌: {CO.bank} {CO.bankAccount} (예금주: {CO.bankHolder})
            </div>

            {/* 배너 */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/banner.png" alt="배너" crossOrigin="anonymous" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '4px' }} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── A4 전용 미니 컴포넌트 ────────────────────────────────
function TblHeader({ label }: { label: string }) {
  return (
    <tr style={{ backgroundColor: '#374151', color: '#fff' }}>
      <td colSpan={4} style={{ padding: '5px 8px', fontWeight: '700', fontSize: '11px', textAlign: 'center', border: '1px solid #374151' }}>{label}</td>
    </tr>
  )
}
function TblRow2({ l1, v1, l2, v2 }: { l1: string; v1: string; l2: string; v2: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 6px', backgroundColor: '#f3f4f6', fontWeight: '600', fontSize: '10px', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: '55px' }}>{l1}</td>
      <td style={{ padding: '4px 6px', fontSize: '10px', border: '1px solid #d1d5db', color: '#111827' }} colSpan={l2 ? 1 : 3}>{v1}</td>
      {l2 && <>
        <td style={{ padding: '4px 6px', backgroundColor: '#f3f4f6', fontWeight: '600', fontSize: '10px', border: '1px solid #d1d5db', whiteSpace: 'nowrap', width: '48px' }}>{l2}</td>
        <td style={{ padding: '4px 6px', fontSize: '10px', border: '1px solid #d1d5db', color: '#111827' }}>{v2}</td>
      </>}
    </tr>
  )
}
function DocSumRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: '600', color: '#111827' }}>{value}</span>
    </div>
  )
}
