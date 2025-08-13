'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to the studio page
    router.push('/studio')
  }, [router])
  
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-400">Redirecting to studio...</div>
    </div>
  )
}