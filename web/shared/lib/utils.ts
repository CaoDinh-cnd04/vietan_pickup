import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return phone
  if (phone.includes('·') || phone.includes('*')) return phone
  return phone.slice(0, 3) + '····' + phone.slice(-3)
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const CUSTOMER_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Doanh nghiệp': { bg: '#dbeafe', text: '#1e40af' },
  'Cá nhân': { bg: '#f3e8ff', text: '#6d28d9' },
  'Đại lý': { bg: '#d1fae5', text: '#065f46' },
}
