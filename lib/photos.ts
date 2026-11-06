// 현장 사진 — 줄여서 올리는 규칙 한 곳
// ─────────────────────────────────────────────────────────
// 사진은 DB 가 아니라 파일 저장소(Supabase Storage 'field-photos')에 두고, 표에는 주소만 남긴다.
// 휴대폰 원본(3~5MB)을 그대로 올리지 않는다 — 긴 변 1280px, JPEG 0.8 이면 영수증 글자가 다 보이고 150~300KB 다.
// 목록에는 썸네일(작게 그린 같은 파일)만 보이고 누르면 원본을 연다.

export interface PhotoRef { url: string; path: string }

export const PHOTO_BUCKET = 'field-photos'   // 공개(주소만 알면 열림, 경로는 랜덤) — 영수증·현장 사진
export const CREW_BUCKET  = 'crew-photos'    // 비공개 — 사람 얼굴. 서명된 주소(signedPhotoUrl)로만 본다
const MAX_EDGE = 1280
const QUALITY = 0.8

/** 브라우저에서 사진을 줄여 JPEG Blob 으로 */
export async function shrinkImage(file: File, maxEdge = MAX_EDGE, quality = QUALITY): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  return blob || file
}

function randomId(): string {
  const b = new Uint8Array(8); crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

/** 줄여서 올리고 주소를 돌려준다. folder 는 'field-logs/<행사id>' 처럼 어디 것인지 */
export async function uploadPhoto(file: File, folder: string, opts: { bucket?: string; maxEdge?: number } = {}): Promise<PhotoRef> {
  const blob = await shrinkImage(file, opts.maxEdge ?? MAX_EDGE)
  const path = `${folder}/${new Date().toISOString().slice(0, 10)}-${randomId()}.jpg`
  const fd = new FormData()
  fd.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
  fd.append('path', path)
  fd.append('bucket', opts.bucket || PHOTO_BUCKET)
  const res = await fetch('/api/storage', { method: 'POST', body: fd })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || '사진 올리기 실패')
  return { url: json.url, path: json.path }
}

/** 비공개 버킷 사진의 서명된 주소(1시간). ERP 잠금 안에서만 받을 수 있다 */
export async function signedPhotoUrl(bucket: string, path: string): Promise<string> {
  const res = await fetch(`/api/storage?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.url) throw new Error(json.error || '사진 주소를 못 받았습니다')
  return json.url
}

/** 기록을 지울 때 사진도 같이. 실패해도 기록 삭제는 막지 않는다 */
export async function deletePhotos(photos?: PhotoRef[] | null): Promise<void> {
  for (const p of photos || []) {
    try { await fetch('/api/storage', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p.path, bucket: PHOTO_BUCKET }) }) }
    catch { /* 무시 */ }
  }
}
