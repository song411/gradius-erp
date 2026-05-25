'use client'

import { useState } from 'react'
import { Search, Phone, Mail, MapPin, ExternalLink, X } from 'lucide-react'

const CONTACTS = [
  { region: '서울', agency: '서울특별시경찰청', dept: '경비과', phone: '02-3150-2114', address: '서울 종로구 사직로 7', note: '서울 전 지역 경비업 허가·신고' },
  { region: '부산', agency: '부산지방경찰청', dept: '생활안전과', phone: '051-899-2114', address: '부산 연제구 경찰로 31', note: '' },
  { region: '대구', agency: '대구지방경찰청', dept: '생활안전과', phone: '053-620-2114', address: '대구 수성구 동대구로 376', note: '' },
  { region: '인천', agency: '인천지방경찰청', dept: '생활안전과', phone: '032-453-2114', address: '인천 남동구 예술로 135', note: '' },
  { region: '광주', agency: '광주지방경찰청', dept: '생활안전과', phone: '062-608-2114', address: '광주 광산구 첨단과기로 235', note: '' },
  { region: '대전', agency: '대전지방경찰청', dept: '생활안전과', phone: '042-609-2114', address: '대전 서구 청사로 136', note: '' },
  { region: '울산', agency: '울산지방경찰청', dept: '생활안전과', phone: '052-210-2114', address: '울산 남구 삼산로 229', note: '' },
  { region: '세종', agency: '세종경찰청', dept: '생활안전과', phone: '044-600-2114', address: '세종시 한누리대로 2130', note: '' },
  { region: '경기남부', agency: '경기남부경찰청', dept: '생활안전과', phone: '031-888-2114', address: '경기 수원시 영통구 청명남로 37', note: '수원·성남·용인·안양 등' },
  { region: '경기북부', agency: '경기북부경찰청', dept: '생활안전과', phone: '031-961-2114', address: '경기 의정부시 청사로 1', note: '의정부·고양·파주·구리 등' },
  { region: '강원', agency: '강원도경찰청', dept: '생활안전과', phone: '033-259-2114', address: '강원 춘천시 공지로 320', note: '' },
  { region: '충북', agency: '충청북도경찰청', dept: '생활안전과', phone: '043-240-2114', address: '충북 청주시 상당구 상당로 155', note: '' },
  { region: '충남', agency: '충청남도경찰청', dept: '생활안전과', phone: '041-336-2114', address: '충남 홍성군 홍북읍 청사로 1', note: '' },
  { region: '전북', agency: '전라북도경찰청', dept: '생활안전과', phone: '063-280-2114', address: '전북 전주시 완산구 온고을로 112', note: '' },
  { region: '전남', agency: '전라남도경찰청', dept: '생활안전과', phone: '061-289-2114', address: '전남 무안군 삼향읍 오룡3길 1', note: '' },
  { region: '경북', agency: '경상북도경찰청', dept: '생활안전과', phone: '054-283-2114', address: '경북 안동시 풍천면 도청대로 455', note: '' },
  { region: '경남', agency: '경상남도경찰청', dept: '생활안전과', phone: '055-233-2114', address: '경남 창원시 의창구 중앙대로 300', note: '' },
  { region: '제주', agency: '제주특별자치도경찰청', dept: '생활안전과', phone: '064-798-2114', address: '제주 제주시 서광로 2길 29', note: '' },
]

const TIPS = [
  '경비업 신규 허가: 주된 사무소 소재지 관할 지방경찰청에 신청',
  '배치신고: 배치 24시간 전까지 관할 경찰서에 신고 (경비업법 제18조)',
  '경비원 신임교육: 배치 전 4시간 이상 이수 필수',
  '법인 경비업 허가 유효기간: 5년 (갱신 필요)',
  '배치폐지신고: 배치 폐지 후 7일 이내 신고',
]

interface Props { onClose: () => void }

export default function ContactsModal({ onClose }: Props) {
  const [search, setSearch] = useState('')

  const filtered = CONTACTS.filter(c =>
    c.region.includes(search) || c.agency.includes(search) || c.note.includes(search)
  )

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 border-b-2 border-gray-200 bg-gradient-to-r from-blue-700 to-blue-900 rounded-t-2xl">
        <div>
          <h2 className="text-lg font-extrabold text-white">📞 전국 경비업 담당 연락처</h2>
          <p className="text-blue-200 text-xs mt-0.5">지방경찰청 생활안전과 / 경비과 — 경비업 허가·신고 담당</p>
        </div>
        <button onClick={onClose} className="text-blue-200 hover:text-white p-1 rounded-lg transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 검색 */}
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 text-sm border-2 border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
            placeholder="지역 또는 청 이름으로 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.map((c, i) => (
          <div key={i} className="bg-white border-2 border-gray-100 hover:border-blue-200 rounded-xl p-3.5 transition-all hover:shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">{c.region}</span>
                  <span className="text-sm font-bold text-gray-800">{c.agency}</span>
                  <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{c.dept}</span>
                </div>
                {c.note && <p className="text-xs text-gray-500 mt-1">{c.note}</p>}
                <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                  <MapPin className="h-3 w-3 shrink-0" />{c.address}
                </div>
              </div>
              <a href={`tel:${c.phone}`}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0">
                <Phone className="h-3.5 w-3.5" />{c.phone}
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* 법령 팁 */}
      <div className="p-4 border-t-2 border-amber-200 bg-amber-50 rounded-b-2xl">
        <p className="text-xs font-bold text-amber-700 mb-2">⚖️ 경비업법 주요 체크포인트</p>
        <div className="space-y-1">
          {TIPS.map((tip, i) => (
            <p key={i} className="text-xs text-amber-800">• {tip}</p>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">※ 연락처는 대표 교환 번호이며 담당자 직통번호는 해당 청에 문의하세요.</p>
      </div>
    </div>
  )
}
