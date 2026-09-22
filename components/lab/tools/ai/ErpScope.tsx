'use client'

import { motion, AnimatePresence } from 'framer-motion'

// AI가 일하는 동안 ERP가 움직이는 것을 보여주는 계기판
// ─────────────────────────────────────────────────────────
// 꾸밈이 목적이 아니다. AI가 무엇을 근거로 말하는지 눈에 보여야 믿을 수 있다.
// 여기 뜨는 행 수는 실제로 Supabase 에서 읽어온 숫자 그대로다.

export interface ScanRow { table: string; rows: number; ms: number }

export interface TraceStep {
  id: string
  label: string
  done: boolean
  ms?: number
}

/** 테이블 이름을 실무자가 쓰는 말로 */
const TABLE_LABEL: Record<string, string> = {
  inquiries: '문의·행사',
  assignments: '배정',
  staff: '크루',
  settlements: '정산',
  payouts: '지급',
  evaluations: '평가',
  estimates: '견적',
  estimate_items: '견적 품목',
  event_expenses: '부대비용',
  roles: '단가표',
}

/** ERP가 가진 모듈들 — 이번에 읽은 것만 불이 들어온다 */
const MODULES = [
  'inquiries', 'estimates', 'assignments',
  'settlements', 'payouts', 'staff', 'evaluations',
]

export default function ErpScope({
  steps, scans, live,
}: {
  steps: TraceStep[]
  scans: ScanRow[]
  /** 아직 일하는 중인지 — 끝나면 조용해진다 */
  live: boolean
}) {
  if (steps.length === 0 && scans.length === 0) return null

  const touched = new Set(scans.map(s => s.table))
  const totalRows = scans.reduce((t, s) => t + s.rows, 0)

  return (
    <div className="ml-[38px] rounded-xl border border-cyan-400/20 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-2xs tracking-wider text-cyan-400/70">▸ ERP SCOPE</span>
        {totalRows > 0 && (
          <motion.span
            key={totalRows}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="font-mono text-2xs text-cyan-300"
          >
            {totalRows.toLocaleString()}행 조회
          </motion.span>
        )}
        {live && (
          <motion.span
            className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          />
        )}
      </div>

      {/* 모듈 지도 — 이번에 건드린 곳에 불이 들어온다 */}
      <div className="mb-2.5 flex flex-wrap gap-1">
        {MODULES.map(m => {
          const on = touched.has(m)
          return (
            <motion.span
              key={m}
              animate={on ? { opacity: 1 } : { opacity: 0.28 }}
              className={`rounded border px-1.5 py-0.5 font-mono text-2xs transition-colors ${
                on
                  ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border-slate-700/60 text-slate-600'
              }`}
            >
              {TABLE_LABEL[m] || m}
            </motion.span>
          )
        })}
      </div>

      {/* 무슨 일을 했는지 */}
      <div className="space-y-[3px] font-mono text-2xs">
        <AnimatePresence initial={false}>
          {steps.map(st => (
            <motion.div
              key={st.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              <span className={st.done ? 'text-emerald-400' : 'text-cyan-400'}>
                {st.done ? '✓' : '▸'}
              </span>
              <span className={st.done ? 'text-slate-400' : 'text-cyan-200'}>{st.label}</span>
              {st.ms !== undefined && (
                <span className="text-slate-600">{(st.ms / 1000).toFixed(1)}s</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* 실제로 읽은 테이블과 행 수 */}
        {scans.map((s, i) => (
          <motion.div
            key={`${s.table}-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 pl-4 text-slate-500"
          >
            <span className="text-cyan-400/40">└</span>
            <span className="w-20 text-slate-400">{TABLE_LABEL[s.table] || s.table}</span>
            <span className="text-slate-300">{s.rows.toLocaleString()}행</span>
            <span className="text-slate-600">{s.ms}ms</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
