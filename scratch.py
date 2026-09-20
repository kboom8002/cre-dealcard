import sys

path = r'c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\utils\image-optimizer.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "category: 'subway' | 'landmark' | 'hospital' | 'university' | 'shopping';",
    "category: 'subway' | 'landmark' | 'hospital' | 'university' | 'shopping' | 'public';"
)
content = content.replace(
    "case 'shopping': return '#A855F7';   // purple",
    "case 'shopping': return '#A855F7';   // purple\n    case 'public': return '#F59E0B';     // amber"
)

old_latlng = '''/**
 * 위경도를 이미지 픽셀 좌표로 변환 (Mercator projection)
 */
function latlngToPixel(
  lat: number, lng: number,
  centerLat: number, centerLng: number,
  zoom: number, imgW: number, imgH: number
): { px: number; py: number } {
  const scale = Math.pow(2, zoom) * 256;
  const worldX = ((lng + 180) / 360) * scale;
  const worldY = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * scale;
  const centerWorldX = ((centerLng + 180) / 360) * scale;
  const centerWorldY = ((1 - Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI) / 2) * scale;
  
  const px = Math.round(imgW / 2 + (worldX - centerWorldX));
  const py = Math.round(imgH / 2 + (worldY - centerWorldY));
  return { px, py };
}'''

new_latlng = '''/**
 * 위경도를 이미지 픽셀 좌표로 변환 (Kakao Static Map level 기반)
 * Kakao Level 4 ≈ 2.0 m/px, Level 6 ≈ 8.0 m/px
 */
function latlngToPixel(
  lat: number, lng: number,
  centerLat: number, centerLng: number,
  metersPerPx: number, imgW: number, imgH: number
): { px: number; py: number } {
  const dxMeters = (lng - centerLng) * 111320 * Math.cos(centerLat * Math.PI / 180);
  const dyMeters = (lat - centerLat) * 111320;
  const px = Math.round(imgW / 2 + dxMeters / metersPerPx);
  const py = Math.round(imgH / 2 - dyMeters / metersPerPx);
  return { px, py };
}'''
content = content.replace(old_latlng, new_latlng)

old_buildPoi = '''function buildPoiOverlays(
  poiSpots: MapPoiSpot[],
  centerLat: number, centerLng: number,
  zoom: number, imgW: number, imgH: number
): Array<{ input: Buffer; left: number; top: number }> {'''
new_buildPoi = '''function buildPoiOverlays(
  poiSpots: MapPoiSpot[],
  centerLat: number, centerLng: number,
  metersPerPx: number, imgW: number, imgH: number
): Array<{ input: Buffer; left: number; top: number }> {'''
content = content.replace(old_buildPoi, new_buildPoi)

old_latlng_call = "const { px, py } = latlngToPixel(spot.lat, spot.lng, centerLat, centerLng, zoom, imgW, imgH);"
new_latlng_call = "const { px, py } = latlngToPixel(spot.lat, spot.lng, centerLat, centerLng, metersPerPx, imgW, imgH);"
content = content.replace(old_latlng_call, new_latlng_call)

old_badge = '''    const textWidth = Math.max(50, cleanName.length * 13 + 18);
    const badgeH = 26;
    const totalW = textWidth + 36;
    const totalH = 36;'''
new_badge = '''    const textWidth = Math.max(50, cleanName.length * 13 + 18);
    const badgeH = 32;
    const totalW = textWidth + 42;
    const totalH = 44;'''
content = content.replace(old_badge, new_badge)

content = content.replace(
    '<text x="${26 + textWidth / 2}" y="22" font-size="11" font-weight="bold"',
    '<text x="${26 + textWidth / 2}" y="22" font-size="13" font-weight="bold"'
)

content = content.replace(
    '<circle cx="16" cy="18" r="14" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>',
    '<circle cx="16" cy="18" r="16" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>'
)

old_walk_radius = "const walkRadiusPx = 110;"
new_walk_radius = '''const walkRadiusMeters = 400; // 도보 5분 (80m/분 × 5분)
          const kakaoMeterPerPx = 2.0;  // Kakao Level 4
          const walkRadiusPx = Math.round(walkRadiusMeters / kakaoMeterPerPx);'''
content = content.replace(old_walk_radius, new_walk_radius)

content = content.replace(
    "          markers: `type:d|size:big|${coordLng},${coordLat}`,\n",
    ""
)

old_kakao_poi = '''          // 2. POI 랜드마크 마커 오버레이 (level 4 ≈ zoom 14)
          if (safePoiSpots.length > 0) {
            const kakaoZoom = 14;
            const poiOverlays = buildPoiOverlays(safePoiSpots, coordLat, coordLng, kakaoZoom, kakaoW, kakaoH);'''
new_kakao_poi = '''          // 2. POI 랜드마크 마커 오버레이 (level 4 ≈ zoom 14)
          if (safePoiSpots.length > 0) {
            const kakaoMeterPerPxForPoi = 2.0; // Kakao Level 4
            const poiOverlays = buildPoiOverlays(safePoiSpots, coordLat, coordLng, kakaoMeterPerPxForPoi, kakaoW, kakaoH);'''
content = content.replace(old_kakao_poi, new_kakao_poi)

old_osm_poi = '''        // POI 마커 오버레이
        const poiOverlays = buildPoiOverlays(safePoiSpots, lat, lng, zoom, compositeWidth, compositeHeight);'''
new_osm_poi = '''        // POI 마커 오버레이
        const osmMeterPerPx = 2.39; // OSM zoom 16 at lat ~37.5
        const poiOverlays = buildPoiOverlays(safePoiSpots, lat, lng, osmMeterPerPx, compositeWidth, compositeHeight);'''
content = content.replace(old_osm_poi, new_osm_poi)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated.")
