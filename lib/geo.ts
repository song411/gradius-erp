// 위치 거리 — 체크인 보조 증거 규칙 한 곳
// ─────────────────────────────────────────────────────────
// 팀장 폰(기준점)과 크루 폰 사이 거리를 재서 기록만 한다. 막지 않는다.
// "멀다"의 기준도 여기 한 곳 — 두 폰의 오차를 더한 만큼은 봐준다.

/** 이 거리(m)를 넘으면 '멀리서 찍음' 표시 */
export const FAR_M = 500

/** 두 좌표 사이 거리(m), 하버사인 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

/** 오차를 감안해도 먼가 — 거리에서 두 폰 오차를 뺀 값이 FAR_M 을 넘을 때 */
export function isFar(distance?: number | null, crewAcc?: number | null, siteAcc?: number | null): boolean {
  if (distance === null || distance === undefined) return false
  return distance - (Number(crewAcc) || 0) - (Number(siteAcc) || 0) > FAR_M
}

/** "320m" / "1.2km" */
export function fmtDistance(m?: number | null): string {
  if (m === null || m === undefined) return ''
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

export interface GeoFix { lat: number; lng: number; acc: number }

/** 브라우저 위치 한 번 받기. 거부·실패·8초 초과면 null — 체크인을 막지 않는다 */
export function getFix(timeoutMs = 8000): Promise<GeoFix | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}
