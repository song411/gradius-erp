'use client'

// 견적 품목 표 — CEO 업체입금·세금계산서 탭이 같이 쓴다.
// 두 탭이 같은 정산 건을 다루는데 한쪽만 품목이 보이던 것을 맞춘다.

import { Package } from 'lucide-react'
import type { EstimateItem } from '@/lib/supabase/types'
import { qtyUnit, daysUnit } from '@/lib/estimateUnits'

const SUPPORT_TYPES = ['지원품목']

export default function EstimateItemsTable({ items, title = '견적 품목' }: { items: EstimateItem[]; title?: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-2">등록된 견적 품목이 없습니다.</p>
  }
  const billable = items.filter(it => !SUPPORT_TYPES.includes(it.item_type || ''))
  const total    = billable.reduce((s, it) => s + it.quantity * it.days * it.unit_price, 0)
  const cost     = billable.reduce((s, it) => s + it.quantity * it.days * it.pay_unit_price, 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-xs font-bold text-gray-700">{title} ({items.length}개)</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-800 text-white">
            {['품목', '일', '명', '청구단가', '지급단가', '합계'].map(h => (
              <th key={h} className="px-3 py-1.5 text-right first:text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const support = SUPPORT_TYPES.includes(it.item_type || '')
            return (
              <tr key={it.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5 font-medium text-gray-800">
                  {it.is_leader && <span className="text-2xs text-amber-600 font-bold mr-1">[팀장]</span>}
                  {it.role_name || it.item_type || '-'}
                  {support && <span className="text-2xs text-sky-600 ml-1">(지원)</span>}
                  {it.vat_exempt && <span className="text-2xs text-gray-400 ml-1">(부가세 제외)</span>}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-600">{it.days}{daysUnit(it.days_unit)}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{it.quantity}{qtyUnit(it.quantity_unit)}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{support ? '-' : it.unit_price.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{support ? '-' : it.pay_unit_price.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right font-bold text-blue-700">
                  {support ? '-' : (it.quantity * it.days * it.unit_price).toLocaleString()}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-bold">
            <td className="px-3 py-1.5 text-gray-700" colSpan={3}>합계 (정가, 할인 전)</td>
            <td className="px-3 py-1.5 text-right text-gray-700">{total.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right text-gray-500">{cost.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right text-blue-800">{total.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
