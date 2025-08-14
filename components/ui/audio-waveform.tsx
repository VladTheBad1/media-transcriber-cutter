'use client'

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface AudioWaveformProps {
  src: string
  clipStart: number
  clipEnd: number
  width: number
  height: number
  className?: string
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  src,
  clipStart,
  clipEnd,
  width,
  height,
  className
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Load and decode audio
  useEffect(() => {
    const loadAudio = async () => {
      try {
        const response = await fetch(src)
        const arrayBuffer = await response.arrayBuffer()
        const audioContext = new AudioContext()
        const buffer = await audioContext.decodeAudioData(arrayBuffer)
        setAudioBuffer(buffer)
        setLoading(false)
      } catch (error) {
        console.error('Failed to load audio:', error)
        setLoading(false)
      }
    }
    
    loadAudio()
  }, [src])
  
  // Draw high-resolution waveform (iMovie style - only upper half)
  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // High resolution canvas
    const scale = 2 // For retina displays
    canvas.width = width * scale
    canvas.height = height * scale
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(scale, scale)
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Get channel data (use first channel) - show entire audio file
    const channelData = audioBuffer.getChannelData(0)
    const totalSamples = channelData.length
    
    // Calculate samples per pixel based on entire audio file
    const samplesPerPixel = Math.max(1, Math.floor(totalSamples / width))
    
    // Enable high quality rendering
    ctx.imageSmoothingEnabled = true
    
    // Draw waveform from bottom up (iMovie style - only positive amplitude)
    const baseY = height // Start from bottom
    
    // Draw waveform bars  
    for (let x = 0; x < width; x++) {
      // Calculate sample range for this pixel - map entire audio to clip width
      const sampleIndex = Math.floor((x / width) * totalSamples)
      
      // Find peak amplitude in this range
      let peak = 0
      
      for (let i = 0; i < samplesPerPixel; i++) {
        const sampleIdx = sampleIndex + i
        if (sampleIdx < channelData.length) {
          const sample = Math.abs(channelData[sampleIdx] || 0)
          peak = Math.max(peak, sample)
        }
      }
      
      // Scale peak to canvas height (only upward)
      const barHeight = Math.max(1, peak * height * 0.9)
      
      // Draw bright cyan bars growing upward from bottom
      ctx.fillStyle = '#00ffff'
      ctx.fillRect(x, baseY - barHeight, 1, barHeight)
      
      // Add white highlights for peaks
      if (peak > 0.6) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.fillRect(x, baseY - barHeight, 1, 1)
      }
    }
    
  }, [audioBuffer, clipStart, clipEnd, width, height])
  
  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none", className)}
      style={{ width, height }}
    />
  )
}

export default AudioWaveform