// Supabase DB 타입 정의 (supabase_schema.sql 기반)

export type InquiryStatus =
  | '접수' | '견적' | '체결' | '배정완료' | '진행중'
  | '완료' | '정산완료' | '미체결' | '보류' | '취소'

export type AssignmentStatus = '후보' | '배정중' | '확정' | '취소'
// 지급 흐름: 대기 → 검토완료(HR 금액 확인) → 지급완료(실입금 처리)
export type PaymentStatus = '대기' | '검토완료' | '지급완료' | '보류' | '완료' | '확인완료' | '미지급'
export type ProjectProgress = '계약체결' | '행사준비' | '행사종료' | '정산완료'
export type DepositStatus = '입금완료' | '부분입금' | '미입금'
export type AttendanceStatus = '출석' | '지각' | '결근' | '조퇴' | '외출'
export type StaffRecommend = '우선투입' | '일반' | '보류'
export type EvalGrade = '우수' | '보통' | '미흡'

export interface Customer {
  id: string
  company_name: string
  rep_name?: string
  biz_number?: string
  biz_type?: string
  biz_item?: string
  address?: string
  email?: string
  contact_name?: string
  phone?: string
  memo?: string
  customer_type?: string
  created_at: string
  updated_at: string
}

export interface Role {
  id: string
  role_code: string
  role_name: string
  base_price: number
  pay_price: number
  leader_bonus: number
  created_at: string
}

export interface Factor {
  id: string
  role_id?: string
  factor_name: string
  description?: string
  add_price: number
  add_pay_price: number
  created_at: string
}

export interface Guide {
  id: string
  role_id?: string
  consult_points?: string
  market_avg_price?: number
  competitor_price?: number
  past_contract_price?: number
  created_at: string
}

export interface Staff {
  id: string
  name: string
  gender?: string
  age?: number
  height?: number
  total_score: number
  english_skill?: string
  driving?: string
  region?: string
  available_jobs?: string[]
  certifications?: string[]
  recommend: StaffRecommend
  phone?: string
  attendance_score: number
  performance_score: number
  appearance_score: number
  teamwork_score: number
  bank_name?: string
  account_number?: string
  id_number?: string
  memo?: string
  created_at: string
  updated_at: string
}

export interface Inquiry {
  id: string
  inquiry_code?: string
  created_at: string
  company_name?: string
  customer_id?: string
  contact_name?: string
  phone?: string
  event_name: string
  location?: string
  event_start?: string
  event_end?: string
  event_time?: string
  service_type?: string
  required_staff?: number
  expected_pay?: number
  status: InquiryStatus
  notes?: string
  memo?: string
  satisfaction?: number
  relationship?: string
  category?: string
  attire?: string
  meal?: string
  parking?: string
  consult_notes?: string
  updated_at: string
}

export interface Estimate {
  id: string
  estimate_code?: string
  inquiry_id?: string
  company_name?: string
  event_name?: string
  site_name?: string
  manager?: string
  site_address?: string
  supply_price: number
  vat: number
  total_price: number
  cost_price: number
  extra_cost: number
  expected_profit?: number
  profit_rate?: number
  attire?: string
  meal?: string
  parking?: string
  notes?: string
  meta_json?: Record<string, unknown>
  send_status?: string
  sent_at?: string
  send_method?: string
  send_memo?: string
  // 복수 견적 지원 (A안/B안 등)
  version_label?: string
  is_final?: boolean
  created_at: string
  updated_at: string
}

// 체결 관리 (세금계산서 + 계약서 발송)
export interface Closing {
  id: string
  closing_code?: string         // CON-YYYYMMDD-XXXX 자동 발급
  inquiry_id?: string
  estimate_id?: string
  customer_id?: string

  // 기본 계약 정보
  company_name?: string
  final_amount?: number         // 최종 계약금액 (견적과 다를 수 있음)
  closing_date?: string         // 체결일
  status?: string               // 체결완료 / 변경 / 파기

  // 세금계산서 발행 정보
  tax_type?: string             // 세금계산서 / 계산서 / 영수증 / 미발행 / 선발행
  tax_biz_number?: string       // 사업자번호
  tax_company?: string          // 상호
  tax_ceo?: string              // 대표자명
  tax_biz_type?: string         // 업태
  tax_biz_item?: string         // 종목
  tax_address?: string          // 주소
  tax_email?: string            // 전자세금계산서 수신 이메일
  tax_issue_date?: string       // 발행 예정일
  tax_issued_at?: string        // 실제 발행일
  tax_status?: string           // 미발행 / 발행완료 / 오류
  tax_memo?: string             // 메모 (100% 선발행 등)

  // 계약서 발송
  contract_sent?: boolean
  contract_sent_date?: string
  contract_sent_method?: string // 이메일 / 카카오 / 우편 / 직접전달
  contract_signed?: boolean

  notes?: string
  created_at: string
  updated_at: string
}

export interface EstimateItem {
  id: string
  estimate_id?: string
  inquiry_id?: string
  role_name?: string
  quantity: number
  days: number
  unit_price: number
  pay_unit_price: number
  spec?: string
  notes?: string
  is_leader: boolean
  discount: number
  item_type: string
  created_at: string
}

export interface EstimateVersion {
  id: string
  version_code?: string
  inquiry_id?: string
  version_name?: string
  items_json?: unknown[]
  supply_total: number
  cost_total: number
  item_count: number
  meta_json?: Record<string, unknown>
  created_at: string
}

export interface Assignment {
  id: string
  assignment_code?: string
  inquiry_id?: string
  event_name?: string
  staff_id?: string
  staff_name?: string
  staff_type: string
  job_type?: string
  phone?: string
  id_number?: string
  bank_name?: string
  account_number?: string
  pay_rate: number
  work_days: number
  total_pay?: number
  status: AssignmentStatus
  assigned_at: string
  work_dates?: string[]
  team_code?: string
  is_payable: boolean
  is_present: boolean
  role_type?: string          // '팀장' | '팀원' | null
  start_date?: string
  end_date?: string
  memo?: string
  updated_at: string
}

export interface Settlement {
  id: string
  inquiry_id?: string
  site_name?: string
  company_name?: string
  dispatch_period?: string
  manager?: string
  site_address?: string
  invoice_amount: number
  supply_price: number
  vat: number
  received_amount: number
  balance?: number
  progress: ProjectProgress
  deposit_status: DepositStatus
  tax_invoice_issued: boolean
  payout_amount: number
  invoice_calc_amount: number
  withholding_tax: number
  category?: string
  profit?: number
  biz_number?: string
  rep_name?: string
  email?: string
  corp_name?: string
  item_description?: string
  contact_phone?: string
  invoice_request?: string
  biz_reg_url?: string
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: string
  record_code?: string
  assignment_id?: string
  inquiry_id?: string
  staff_name?: string
  work_date: string
  clock_in?: string
  clock_out?: string
  work_hours?: number
  daily_pay: number
  status: AttendanceStatus
  reason?: string
  notes?: string
  created_at: string
}

export interface Evaluation {
  id: string
  eval_code?: string
  assignment_id?: string
  staff_id?: string
  staff_name?: string
  site_name?: string
  attendance_score: number
  performance_score: number
  appearance_score: number
  teamwork_score: number
  adaptability_score: number
  total_score: number
  grade: EvalGrade
  evaluator?: string
  strengths?: string
  improvements?: string
  re_recommend: boolean
  notes?: string
  evaluated_at: string
}

export interface Payout {
  id: string
  payout_code?: string
  assignment_id?: string
  inquiry_id?: string
  staff_name?: string
  site_name?: string
  dispatch_period?: string
  dispatch_days: number
  base_pay: number
  overtime_pay: number
  meal_pay: number
  transport_pay: number
  bonus: number
  subtotal: number
  tax_deduction: number
  final_pay: number
  status: PaymentStatus
  paid_at?: string
  paid_by?: string
  bank_name?: string
  account_number?: string
  id_number?: string
  notes?: string
  created_at: string
  updated_at: string
}

// 조인 타입
export interface InquiryWithCustomer extends Inquiry {
  customers?: Customer
}

export interface AssignmentWithStaff extends Assignment {
  staff?: Staff
  inquiries?: Inquiry
}

export interface EstimateWithItems extends Estimate {
  estimate_items?: EstimateItem[]
  inquiries?: Inquiry
}

export interface SettlementWithInquiry extends Settlement {
  inquiries?: Inquiry
}

// 대시보드 집계 타입
export interface DashboardStats {
  totalInquiries: number
  activeInquiries: number
  monthlyRevenue: number
  monthlyProfit: number
  unpaidAmount: number
  paymentRate: number
  pipelineByStatus: Record<string, number>
}
