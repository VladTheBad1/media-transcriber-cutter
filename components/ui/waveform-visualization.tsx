'use client'

import React, { useEffect, useRef, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface WaveformVisualizationProps {
  waveformData: number[]
  duration: number
  width: number
  height: number
  color?: string
  opacity?: number
  currentTime?: number
  className?: string
  onSeek?: (time: number) => void
  zoom?: number
  offset?: number
}

export const WaveformVisualization: React.FC<WaveformVisualizationProps> = ({
  waveformData,
  duration,
  width,
  height,
  color = 'blue',
  opacity = 0.7,
  currentTime,
  className,
  onSeek,
  zoom = 1,
  offset = 0
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()

  // Memoize processed waveform data for performance
  const processedData = useMemo(() => {
    if (!waveformData || waveformData.length === 0) return []
    
    const samplesPerPixel = Math.max(1, Math.floor(waveformData.length / width))
    const processedSamples: number[] = []
    
    for (let i = 0; i < width; i++) {
      const start = i * samplesPerPixel
      const end = Math.min(start + samplesPerPixel, waveformData.length)
      
      // Find peak values in this pixel's sample range
      let max = 0
      for (let j = start; j < end; j++) {
        max = Math.max(max, Math.abs(waveformData[j] || 0))
      }
      
      processedSamples.push(max)
    }
    
    return processedSamples
  }, [waveformData, width])

  // Color mapping for different track types
  const getWaveformColors = (colorName: string) => {
    const colors = {
      blue: { primary: '#3B82F6', secondary: '#1E40AF' },
      green: { primary: '#10B981', secondary: '#047857' },
      purple: { primary: '#8B5CF6', secondary: '#5B21B6' },
      orange: { primary: '#F59E0B', secondary: '#D97706' },
      red: { primary: '#EF4444', secondary: '#DC2626' },
      gray: { primary: '#6B7280', secondary: '#374151' }
    }
    return colors[colorName as keyof typeof colors] || colors.blue
  }

  const drawWaveform = () => {
    const canvas = canvasRef.current
    if (!canvas || processedData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas dimensions
    canvas.width = width
    canvas.height = height

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    const colors = getWaveformColors(color)
    const centerY = height / 2
    const maxAmplitude = centerY * 0.9 // Leave some padding

    // Create gradient for waveform
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, `${colors.primary}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`)
    gradient.addColorStop(0.5, `${colors.secondary}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`)
    gradient.addColorStop(1, `${colors.primary}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`)

    ctx.fillStyle = gradient
    ctx.strokeStyle = colors.primary + Math.round(opacity * 255).toString(16).padStart(2, '0')
    ctx.lineWidth = 1

    // Draw waveform
    ctx.beginPath()
    
    // Create filled waveform path
    for (let x = 0; x < processedData.length; x++) {
      const amplitude = processedData[x] * maxAmplitude
      const y1 = centerY - amplitude
      const y2 = centerY + amplitude
      
      if (x === 0) {
        ctx.moveTo(x, y1)
      } else {
        ctx.lineTo(x, y1)
      }
    }
    
    // Complete the path for filling
    for (let x = processedData.length - 1; x >= 0; x--) {
      const amplitude = processedData[x] * maxAmplitude
      const y2 = centerY + amplitude
      ctx.lineTo(x, y2)
    }
    
    ctx.closePath()
    ctx.fill()

    // Draw center line
    ctx.strokeStyle = `${colors.secondary}40`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()

    // Draw progress indicator if currentTime is provided
    if (currentTime !== undefined && duration > 0) {
      const progressX = (currentTime / duration) * width
      
      // Progress overlay
      ctx.fillStyle = `${colors.primary}20`
      ctx.fillRect(0, 0, progressX, height)
      
      // Progress line
      ctx.strokeStyle = colors.primary
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(progressX, 0)
      ctx.lineTo(progressX, height)
      ctx.stroke()
    }
  }

  // Redraw waveform when data changes
  useEffect(() => {
    drawWaveform()
  }, [processedData, width, height, color, opacity, currentTime, duration])

  // Handle canvas click for seeking
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration <= 0) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const clickTime = (x / width) * duration
    
    onSeek(Math.max(0, Math.min(clickTime, duration)))
  }

  // Handle canvas hover for preview
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const hoverTime = (x / width) * duration
    
    // Update cursor style based on whether seeking is enabled
    canvasRef.current.style.cursor = onSeek ? 'pointer' : 'default'
    
    // Optional: Show time tooltip (would need additional state management)
  }

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        'absolute inset-0 pointer-events-auto',
        onSeek && 'cursor-pointer hover:opacity-80',
        className
      )}
      style={{ width, height }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      aria-label={`Waveform visualization ${currentTime ? `at ${Math.round(currentTime * 100) / 100}s` : ''}`}
    />
  )
}

// Utility function to generate waveform data from audio buffer
export const generateWaveformData = (audioBuffer: AudioBuffer, samples: number = 1000): number[] => {
  const channelData = audioBuffer.getChannelData(0) // Use first channel
  const samplesPerChunk = Math.floor(channelData.length / samples)
  const waveformData: number[] = []
  
  for (let i = 0; i < samples; i++) {
    const start = i * samplesPerChunk
    const end = Math.min(start + samplesPerChunk, channelData.length)
    
    let max = 0
    for (let j = start; j < end; j++) {
      max = Math.max(max, Math.abs(channelData[j]))
    }
    
    waveformData.push(max)
  }
  
  return waveformData
}

// Component for displaying a mini waveform in clip thumbnails
export const MiniWaveform: React.FC<{
  waveformData: number[]
  width: number
  height: number
  color?: string
}> = ({ waveformData, width, height, color = 'gray' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !waveformData.length) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height

    ctx.clearRect(0, 0, width, height)

    const colors = {
      gray: '#6B7280',
      blue: '#3B82F6',
      green: '#10B981'
    }

    ctx.strokeStyle = colors[color as keyof typeof colors] || colors.gray
    ctx.lineWidth = 1

    const centerY = height / 2
    const maxAmplitude = centerY * 0.8

    ctx.beginPath()
    for (let i = 0; i < Math.min(waveformData.length, width); i++) {
      const amplitude = waveformData[i] * maxAmplitude
      const x = (i / waveformData.length) * width
      const y1 = centerY - amplitude
      const y2 = centerY + amplitude

      ctx.moveTo(x, y1)
      ctx.lineTo(x, y2)
    }
    ctx.stroke()
  }, [waveformData, width, height, color])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{ width, height }}
    />
  )
}

export default WaveformVisualization