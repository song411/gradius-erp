'use client'

import { useState } from 'react'
import { X, Calculator, RefreshCw } from 'lucide-react'

const RATES = [
  { label: '3.3% (사업소득)', key: '3.3', rate: 0.033, desc: '프리랜서·단기 인력 표준 공제율' },
  { label: '0.9% (근로소득)', key: '0.9', rate: 0.009, desc: '근로소득 원천징수 (간이세액표 기준)' },
  { label: '비과세 (0%)',    key: '0',   rate: 0,     desc: '일용직 비과세 (1일 15만원 이하)' },
]

function comma(n: number) {
  return n.toLocaleString('ko-KR')
}

interface Props { onClose: () => void }

export default function TaxCalcModal({ onClose }: Props) {
  const [gross, setGross] = useState('')
  const [rateKey, setRateKey] = useState('3.3')

  const grossNum = parseInt(gross.replace(/,/g, ''), 10) || 0
  const selectedRate = RATES.find(r => r.key === rateKey)!
  const deduction = Math.floor(grossNum * selectedRate.rate)
  const net = grossNum - deduction

  function handleInput(v: string) {
    const num = v.replace(/[^0-9]/g, '')
    setGross(num ? parseInt(num, 10).toLocaleString('ko-KR') : '')
  }

  function reset() { setGross(''); setRateKey('3.3') }

  return (
    <div className="flex flex-col max-h-[70vh]">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 border-b-2 border-gray-200 bg-gradient-to-r from-emerald-600 to-teal-700 rounded-t-2xl">
        <div>
          <h2 className="text-lg font-extrabold text-white">🧮 세금 공제 계산기</h2>
          <p className="text-emerald-100 text-xs mt-0.5">3.3% / 0.9% / 비과세 실수령액 계산</p>
        </div>
        <button onClick={onClose} className="text-emerald-200 hover:text-white p-1 rounded-lg"><X className="h-5 w-5" /></button>
      </div>

      <div className="p-5 space-y-5 overflow-y-auto">
        {/* 금액 입력 */}
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1.5">지급 총액 (원)</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-400 text-sm font-semibold">₩</span>
            <input
              type="text"
              inputMode="numeric"
              value={gross}
              onChange={e => handleInput(e.target.value)}
              placeholder="1,300,000"
              className="w-full pl-8 pr-4 py-2.5 text-lg font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-400 text-right"
            />
          </div>
        </div>

        {/* 공제율 선택 */}
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1.5">공제율</label>
          <div className="space-y-2">
            {RATES.map(r => (
              <button key={r.key} onClick={() => setRateKey(r.key)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  rateKey === r.key
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:border-emerald-200'
                }`}>
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${rateKey === r.key ? 'border-emerald-500' : 'border-gray-300'}`}>
                  {rateKey === r.key && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                </div>
                <div>
                  <p className={`text-sm font-bold ${rateKey === r.key ? 'text-emerald-700' : 'text-gray-700'}`}>{r.label}</p>
                  <p className="text-xs text-gray-400">{r.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 결과 */}
        {grossNum > 0 && (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-emerald-700 flex items-center gap-1"><Calculator className="h-3.5 w-3.5" />계산 결과</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">지급 총액</span>
                <span className="text-sm font-semibold text-gray-800">₩ {comma(grossNum)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-red-500">공제액 ({selectedRate.label.split(' ')[0]})</span>
                <span className="text-sm font-semibold text-red-500">- ₩ {comma(deduction)}</span>
              </div>
              <div className="border-t-2 border-emerald-200 pt-2 flex justify-between items-center">
                <span className="text-base font-extrabold text-gray-800">실수령액</span>
                <span className="text-xl font-extrabold text-emerald-700">₩ {comma(net)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 다회 계산 비교 */}
        {grossNum > 0 && (
          <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 mb-3">📊 공제율 비교</p>
            <div className="space-y-2">
              {RATES.map(r => {
                const ded = Math.floor(grossNum * r.rate)
                const n = grossNum - ded
                return (
                  <div key={r.key} className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">{r.label.split(' ')[0]}</span>
                    <div className="text-right">
                      <span className="text-gray-400 mr-3">(-{comma(ded)})</span>
                      <span className={`font-bold ${rateKey === r.key ? 'text-emerald-700' : 'text-gray-700'}`}>₩ {comma(n)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <button onClick={reset}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-2 hover:bg-gray-50 rounded-lg transition-colors">
          <RefreshCw className="h-3 w-3" />초기화
        </button>
      </div>
    </div>
  )
}
