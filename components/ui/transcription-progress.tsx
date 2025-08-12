'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'

interface TranscriptionProgressProps {
  progress: number
  timeElapsed: number
  estimatedTimeRemaining: number
  status: string
}

export const TranscriptionProgress: React.FC<TranscriptionProgressProps> = ({
  progress,
  timeElapsed,
  estimatedTimeRemaining,
  status
}) => {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${minutes}m ${secs}s`
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="font-medium">{status || 'Transcribing...'}</span>
        </div>
        <span className="text-gray-500">{Math.round(progress)}%</span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div 
          className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Elapsed: {formatTime(timeElapsed)}</span>
        {estimatedTimeRemaining > 0 && (
          <span>Remaining: ~{formatTime(estimatedTimeRemaining)}</span>
        )}
      </div>
    </div>
  )
}

export default TranscriptionProgress