// app/content/page.tsx — 서버 컴포넌트로 전환
import { redirect } from 'next/navigation'

export default function ContentPage() {
  redirect('/sns/studio')
}
