/** Kiểu dữ liệu API cân lại (api/Reweight.cs). */
export interface Dim { dai: number; rong: number; cao: number; trongLuong: number; quiDoi: number | null; chargeWeight: number | null }
export interface CanLai extends Dim { at: string | null; userName: string }
export interface RwKien { kienSo: number; idHinh: number | null; hasPhoto: boolean; kho: Dim | null; canLai: CanLai | null }
export interface RwBill { orderNumber: number; maVanDonId: number; code: string; customerName: string | null; soKien: number; kienScan: number | null; kiens: RwKien[] }
export interface RwRow {
  id: number; idHinh: number; hasPhoto: boolean; orderNumber: string; kienSo: number; maVanDonId: number | null; customerName: string | null
  canLai: CanLai; kho: Dim | null; lech: number | null
}

export const dimText = (d: Dim) => `${d.dai}×${d.rong}×${d.cao}`
