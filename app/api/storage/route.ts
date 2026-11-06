import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 허용된 버킷 목록 (보안 화이트리스트)
const ALLOWED_BUCKETS = ['guard-documents', 'field-photos', 'crew-photos']   // 없으면 아래서 만든다
// 공개로 만들 버킷. crew-photos(사람 얼굴)는 비공개 — GET 의 서명 주소로만 본다
const PUBLIC_BUCKETS = ['guard-documents', 'field-photos']

// 허용된 파일 타입
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']

// 파일 업로드
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file     = formData.get('file') as File | null
    const path     = formData.get('path') as string | null
    const bucket   = (formData.get('bucket') as string) || 'guard-documents'

    if (!file)   return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    if (!path)   return NextResponse.json({ error: '저장 경로가 없습니다.' }, { status: 400 })
    if (!ALLOWED_BUCKETS.includes(bucket))
                 return NextResponse.json({ error: '허용되지 않은 버킷입니다.' }, { status: 403 })
    if (!ALLOWED_TYPES.includes(file.type))
                 return NextResponse.json({ error: '허용되지 않은 파일 형식입니다. (JPG/PNG/PDF만 가능)' }, { status: 400 })

    // 파일 크기 제한 10MB
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 })

    const supabase = createAdminClient()
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    // 버킷이 아직 없으면 만들고 한 번 더 — 사진 버킷은 Supabase 콘솔을 거치지 않아도 되게
    if (error && /bucket/i.test(error.message) && /not found/i.test(error.message)) {
      await supabase.storage.createBucket(bucket, { public: PUBLIC_BUCKETS.includes(bucket), fileSizeLimit: 10 * 1024 * 1024 })
      const retry = await supabase.storage.from(bucket).upload(path, buffer, { contentType: file.type, upsert: true })
      data = retry.data; error = retry.error
    }

    if (error || !data) return NextResponse.json({ error: error?.message || '업로드 실패' }, { status: 500 })

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
    return NextResponse.json({ url: urlData.publicUrl, path: data.path })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 비공개 버킷의 서명 주소 (1시간). 이 라우트는 잠금 안이라 ERP 에 들어온 사람만 받는다
export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get('bucket') || ''
  const path   = request.nextUrl.searchParams.get('path') || ''
  if (!ALLOWED_BUCKETS.includes(bucket) || !path) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ error: error?.message || '주소를 만들지 못했습니다.' }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}

// 파일 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { path, bucket = 'guard-documents' } = await request.json()

    if (!path)   return NextResponse.json({ error: '삭제할 경로가 없습니다.' }, { status: 400 })
    if (!ALLOWED_BUCKETS.includes(bucket))
                 return NextResponse.json({ error: '허용되지 않은 버킷입니다.' }, { status: 403 })

    const supabase = createAdminClient()
    const { error } = await supabase.storage.from(bucket).remove([path])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
