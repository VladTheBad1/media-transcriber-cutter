'use client'

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface VideoThumbnailsProps {
  src: string
  clipStart: number
  clipEnd: number
  clipWidth: number
  height: number
  frameInterval?: number // Seconds between thumbnails
  className?: string
}

export const VideoThumbnails: React.FC<VideoThumbnailsProps> = ({
  src,
  clipStart,
  clipEnd,
  clipWidth,
  height,
  frameInterval = 1, // Default 1 second between frames
  className
}) => {
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const generateThumbnails = async () => {
      if (!videoRef.current || !canvasRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      setIsLoading(true)
      const generatedThumbnails: string[] = []

      try {
        // Wait for video to load metadata
        await new Promise((resolve, reject) => {
          video.addEventListener('loadedmetadata', resolve, { once: true })
          video.addEventListener('error', reject, { once: true })
          video.load()
        })

        const duration = clipEnd - clipStart
        const thumbnailCount = Math.min(Math.ceil(duration / frameInterval), 30) // Max 30 thumbnails for HD detail
        const actualInterval = duration / thumbnailCount

        // Set canvas size for high resolution
        const scale = 2 // For retina displays
        canvas.width = height * (video.videoWidth / video.videoHeight) * scale
        canvas.height = height * scale
        canvas.style.width = `${canvas.width / scale}px`
        canvas.style.height = `${canvas.height / scale}px`
        ctx.scale(scale, scale)

        for (let i = 0; i < thumbnailCount; i++) {
          const time = clipStart + (i * actualInterval)
          
          // Seek to time
          video.currentTime = time
          
          // Wait for seek to complete
          await new Promise((resolve) => {
            video.addEventListener('seeked', resolve, { once: true })
          })

          // Draw frame to canvas with high quality
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(video, 0, 0, canvas.width / scale, canvas.height / scale)
          
          // Convert to data URL with high quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
          generatedThumbnails.push(dataUrl)
        }

        setThumbnails(generatedThumbnails)
      } catch (error) {
        console.error('Error generating thumbnails:', error)
      } finally {
        setIsLoading(false)
      }
    }

    generateThumbnails()
  }, [src, clipStart, clipEnd, height, frameInterval])

  const thumbnailWidth = clipWidth / thumbnails.length

  return (
    <div className={cn("absolute inset-0 flex overflow-hidden", className)}>
      {/* Hidden video element for frame extraction */}
      <video
        ref={videoRef}
        src={src}
        style={{ display: 'none' }}
        crossOrigin="anonymous"
      />
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
      
      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800/50">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
        </div>
      )}
      
      {/* Thumbnails - full opacity for HD clarity */}
      {!isLoading && thumbnails.map((thumbnail, index) => (
        <img
          key={index}
          src={thumbnail}
          alt={`Frame ${index}`}
          className="flex-shrink-0 object-cover"
          style={{ width: thumbnailWidth, height: '100%' }}
        />
      ))}
    </div>
  )
}

// Simplified version that shows a single frame
export const VideoFramePreview: React.FC<{
  src: string
  time: number
  width: number
  height: number
  className?: string
}> = ({ src, time, width, height, className }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const generateThumbnail = async () => {
      if (!videoRef.current || !canvasRef.current) return

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      try {
        await new Promise((resolve, reject) => {
          video.addEventListener('loadedmetadata', resolve, { once: true })
          video.addEventListener('error', reject, { once: true })
          video.load()
        })

        canvas.width = width
        canvas.height = height

        video.currentTime = time
        await new Promise((resolve) => {
          video.addEventListener('seeked', resolve, { once: true })
        })

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        setThumbnail(canvas.toDataURL('image/jpeg', 0.6))
      } catch (error) {
        console.error('Error generating thumbnail:', error)
      }
    }

    generateThumbnail()
  }, [src, time, width, height])

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        style={{ display: 'none' }}
        crossOrigin="anonymous"
      />
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
      {thumbnail && (
        <img
          src={thumbnail}
          alt="Video frame"
          className={cn("w-full h-full object-cover", className)}
        />
      )}
    </>
  )
}

export default VideoThumbnails