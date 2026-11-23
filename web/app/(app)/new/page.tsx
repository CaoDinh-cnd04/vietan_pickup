import { Suspense } from 'react'
import NewBookingPage from '@/features/booking/NewBookingPage'

// useSearchParams (?taiKho=1) cần Suspense khi Next prerender trang tĩnh.
export default function Page() {
  return <Suspense><NewBookingPage /></Suspense>
}
