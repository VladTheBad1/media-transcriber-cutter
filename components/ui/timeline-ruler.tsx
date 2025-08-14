'use client'

import React from 'react'
import { formatTime } from '@/lib/utils'

interface TimelineRulerProps {
  duration: number
  pixelsPerSecond: number
  width: number
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  duration,
  pixelsPerSecond,
  width
}) => {
  const markers = []
  const interval = Math.max(1, Math.floor(100 / pixelsPerSecond))
  
  for (let time = 0; time <= duration; time += interval) {
    const x = time * pixelsPerSecond
    const isMinute = time % 60 === 0
    const isTenSecond = time % 10 === 0
    
    markers.push(
      <div
        key={time}
        className="absolute top-0 h-full"
        style={{ left: x }}
      >
        <div className={`h-2 border-l ${isMinute ? 'border-gray-400' : isTenSecond ? 'border-gray-500' : 'border-gray-600'}`} />
      </div>
    )
  }
  
  return (
    <div className="relative h-full overflow-hidden">
      {markers}
    </div>
  )
}

export default TimelineRuler