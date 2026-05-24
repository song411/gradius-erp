import Header from '@/components/layout/Header'
import SearchContent from '@/components/search/SearchContent'

export default function SearchPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="통합검색" subtitle="전체 데이터 통합 검색" />
      <div className="flex-1 overflow-y-auto p-6">
        <SearchContent />
      </div>
    </div>
  )
}
