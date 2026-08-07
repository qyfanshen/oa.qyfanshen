/**
 * 打卡定位校验
 * 公司位置通过环境变量配置（OFFICE_LAT / OFFICE_LNG / OFFICE_RADIUS_M），
 * 未配置时跳过位置校验（宽松模式，兼容未配置场景）。
 */
export const OFFICE = {
  lat: Number(process.env.OFFICE_LAT) || 0,
  lng: Number(process.env.OFFICE_LNG) || 0,
  radiusM: Number(process.env.OFFICE_RADIUS_M) || 500,
};

/** 是否已配置公司位置（配置后开启范围校验） */
export function isOfficeConfigured(): boolean {
  return OFFICE.lat !== 0 && OFFICE.lng !== 0;
}

/** 两个经纬度之间的球面距离（米），Haversine 公式 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 校验打卡位置
 * @returns 错误信息；返回 null 表示校验通过
 */
export function validateLocation(lat?: number, lng?: number): string | null {
  // 未配置公司位置 → 不校验（宽松模式）
  if (!isOfficeConfigured()) return null;
  // 缺少有效定位 → 视为无法定位
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return "无法获取定位，请检查定位权限后重试";
  }
  const distance = distanceMeters(lat, lng, OFFICE.lat, OFFICE.lng);
  if (distance > OFFICE.radiusM) {
    return `不在打卡范围内（距公司 ${Math.round(distance)} 米，允许 ${OFFICE.radiusM} 米内）`;
  }
  return null;
}
