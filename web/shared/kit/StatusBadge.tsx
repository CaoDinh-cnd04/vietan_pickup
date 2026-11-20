import { cn } from '@/shared/lib/utils'

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red'

const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-primary-light text-primary border-primary-border',
  green: 'bg-success-light text-success border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-danger-light text-danger border-danger-border',
}

export default function StatusBadge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  )
}

export const CLAIM_STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Mới', tone: 'blue' },
  2: { label: 'Đang xử lý', tone: 'amber' },
  3: { label: 'Đồng ý', tone: 'green' },
  4: { label: 'Hoàn thành', tone: 'gray' },
  5: { label: 'Không đồng ý', tone: 'red' },
}

export const TROUBLE_STATUS: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'Mới', tone: 'blue' },
  2: { label: 'Đang xử lý', tone: 'amber' },
  3: { label: 'Đã đóng', tone: 'gray' },
}
