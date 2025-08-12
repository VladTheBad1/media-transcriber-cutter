'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Volume2, VolumeX, Settings, SkipBack, SkipForward, Maximize2 } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'

interface MediaPlayerProps {
  src: string
  type: 'video' | 'audio'
  onTimeUpdate?: (currentTime: number) => void
  onSeek?: (time: number) => void
  onLoadedMetadata?: (duration: number) => void
  transcript?: TranscriptSegment[]
  className?: string
  controls?: boolean
  autoPlay?: boolean
}

interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
  speaker?: string
  confidence?: number
}

interface PlayerControls {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  playbackRate: number
  isMuted: boolean
  isFullscreen: boolean
}

export interface MediaPlayerRef {
  seekTo: (time: number) => void
  pause: () => void
  play: () => void
}

export const MediaPlayer = React.forwardRef<MediaPlayerRef, MediaPlayerProps>(({
  src,
  type,
  onTimeUpdate,
  onSeek,
  onLoadedMetadata,
  transcript = [],
  className,
  controls = true,
  autoPlay = false
}, ref) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const [playerState, setPlayerState] = useState<PlayerControls>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    playbackRate: 1,
    isMuted: false,
    isFullscreen: false
  })

  // Control functions (defined early for keyboard shortcuts)
  const togglePlayPause = useCallback(async () => {
    if (!mediaRef.current) return
    
    try {
      if (playerState.isPlaying) {
        await mediaRef.current.pause()
      } else {
        await mediaRef.current.play()
      }
    } catch (error) {
      console.error('Playback error:', error)
    }
  }, [playerState.isPlaying])

  const seekRelative = useCallback((seconds: number) => {
    if (!mediaRef.current) return
    const newTime = Math.min(Math.max(playerState.currentTime + seconds, 0), playerState.duration || 0)
    mediaRef.current.currentTime = newTime
    setPlayerState(prev => ({ ...prev, currentTime: newTime }))
    
    // Notify parent about seek
    onSeek?.(newTime)
  }, [playerState.currentTime, playerState.duration, onSeek])

  const adjustVolume = useCallback((delta: number) => {
    if (!mediaRef.current) return
    
    const newVolume = Math.min(Math.max(playerState.volume + delta, 0), 1)
    mediaRef.current.volume = newVolume
    setPlayerState(prev => ({ ...prev, volume: newVolume, isMuted: newVolume === 0 }))
  }, [playerState.volume])

  const toggleMute = useCallback(() => {
    if (!mediaRef.current) return
    
    const newMuted = !playerState.isMuted
    mediaRef.current.muted = newMuted
    setPlayerState(prev => ({ ...prev, isMuted: newMuted }))
  }, [playerState.isMuted])

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenEnabled || type !== 'video') return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (containerRef.current) {
        await containerRef.current.requestFullscreen()
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
    }
  }, [type])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement) {
        return
      }
      
      if (!mediaRef.current) return
      
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seekRelative(-5)
          break
        case 'ArrowRight':
          e.preventDefault()
          seekRelative(5)
          break
        case 'ArrowUp':
          e.preventDefault()
          adjustVolume(0.1)
          break
        case 'ArrowDown':
          e.preventDefault()
          adjustVolume(-0.1)
          break
        case 'm':
        case 'M':
          e.preventDefault()
          toggleMute()
          break
        case 'f':
        case 'F':
          if (type === 'video') {
            e.preventDefault()
            toggleFullscreen()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [togglePlayPause, seekRelative, adjustVolume, toggleMute, toggleFullscreen, type])

  // Media event handlers
  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      const duration = mediaRef.current.duration
      setPlayerState(prev => ({ ...prev, duration }))
      onLoadedMetadata?.(duration)
      setIsLoading(false)
    }
  }

  const handleTimeUpdate = () => {
    if (mediaRef.current && !isDragging) {
      const currentTime = mediaRef.current.currentTime
      setPlayerState(prev => ({ ...prev, currentTime }))
      onTimeUpdate?.(currentTime)
    }
  }

  const handleError = () => {
    setError('Failed to load media file')
    setIsLoading(false)
  }

  const handlePlay = () => {
    setPlayerState(prev => ({ ...prev, isPlaying: true }))
  }

  const handlePause = () => {
    setPlayerState(prev => ({ ...prev, isPlaying: false }))
  }

  const seekTo = useCallback((time: number) => {
    if (!mediaRef.current) return
    
    // Get current duration from the media element directly
    const duration = mediaRef.current.duration || 0
    const clampedTime = Math.min(Math.max(time, 0), duration)
    
    console.log('🎯 Media Player seekTo called:', {
      requestedTime: time.toFixed(2),
      clampedTime: clampedTime.toFixed(2),
      duration: duration.toFixed(2)
    })
    
    // Set the media element's current time
    mediaRef.current.currentTime = clampedTime
    
    // The state will be updated by handleTimeUpdate event
    // which is triggered when currentTime changes
    
    // Call the onSeek callback if provided
    onSeek?.(clampedTime)
  }, [onSeek])
  
  // Expose seekTo method through ref
  React.useImperativeHandle(ref, () => ({
    seekTo,
    pause: () => {
      if (mediaRef.current) {
        mediaRef.current.pause()
        setPlayerState(prev => ({ ...prev, isPlaying: false }))
      }
    },
    play: () => {
      if (mediaRef.current) {
        mediaRef.current.play()
        setPlayerState(prev => ({ ...prev, isPlaying: true }))
      }
    }
  }), [seekTo])

  const setPlaybackRate = (rate: number) => {
    if (!mediaRef.current) return
    
    mediaRef.current.playbackRate = rate
    setPlayerState(prev => ({ ...prev, playbackRate: rate }))
  }

  // Progress bar interaction
  const handleProgressClick = (e: React.MouseEvent) => {
    if (!progressRef.current) return
    
    // Stop propagation to prevent conflicts
    e.stopPropagation()
    
    const rect = progressRef.current.getBoundingClientRect()
    const clickPosition = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    const newTime = clickPosition * playerState.duration
    
    console.log('Progress bar clicked - seeking to:', newTime, 'seconds')
    seekTo(newTime)
  }

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    // Don't start dragging if we just want to click
    if (e.type === 'mousedown') {
      setIsDragging(true)
      handleProgressClick(e)
    }
  }

  const handleProgressMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !progressRef.current) return
    
    const rect = progressRef.current.getBoundingClientRect()
    const clickPosition = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    const newTime = clickPosition * playerState.duration
    seekTo(newTime)
  }, [isDragging, playerState.duration, seekTo])

  const handleProgressMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleProgressMouseMove)
      document.addEventListener('mouseup', handleProgressMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleProgressMouseMove)
        document.removeEventListener('mouseup', handleProgressMouseUp)
      }
    }
  }, [isDragging, handleProgressMouseMove, handleProgressMouseUp])

  // Get current transcript segment
  const getCurrentTranscriptSegment = () => {
    return transcript.find(segment => 
      playerState.currentTime >= segment.start && playerState.currentTime <= segment.end
    )
  }

  const progress = playerState.duration > 0 ? (playerState.currentTime / playerState.duration) * 100 : 0

  if (error) {
    return (
      <div className={cn("flex items-center justify-center bg-gray-900 rounded-lg p-8", className)}>
        <div className="text-center">
          <div className="text-red-400 mb-2">⚠️</div>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative bg-black rounded-lg overflow-hidden", className)}
    >
      {/* Media Element */}
      {type === 'video' ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          className="w-full h-auto"
          autoPlay={autoPlay}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onError={handleError}
          onPlay={handlePlay}
          onPause={handlePause}
        />
      ) : (
        <div className="w-full aspect-video bg-gray-900 flex items-center justify-center relative">
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={src}
            autoPlay={autoPlay}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onError={handleError}
            onPlay={handlePlay}
            onPause={handlePause}
          />
          <div className="text-center">
            <div className="text-6xl mb-4">🎵</div>
            <div className="text-gray-400 text-sm">Audio File</div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
            <p>Loading...</p>
          </div>
        </div>
      )}

      {/* Controls */}
      {controls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div
            ref={progressRef}
            className="w-full h-2 bg-gray-600 rounded-full cursor-pointer mb-3 relative hover:h-3 transition-all"
            onClick={handleProgressClick}
            onMouseDown={(e) => {
              e.preventDefault()
              handleProgressMouseDown(e)
            }}
            role="slider"
            aria-label="Seek slider"
            aria-valuemin={0}
            aria-valuemax={playerState.duration}
            aria-valuenow={playerState.currentTime}
            tabIndex={0}
            title={`Click to seek (${formatTime(playerState.currentTime)} / ${formatTime(playerState.duration)})`}
          >
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-150 pointer-events-none"
              style={{ width: `${progress}%` }}
            />
            {/* Current transcript indicator */}
            {transcript.map((segment) => {
              const segmentStart = (segment.start / playerState.duration) * 100
              const segmentWidth = ((segment.end - segment.start) / playerState.duration) * 100
              
              return (
                <div
                  key={segment.id}
                  className="absolute top-0 h-full bg-green-400 opacity-30 rounded-full pointer-events-none"
                  style={{
                    left: `${segmentStart}%`,
                    width: `${segmentWidth}%`
                  }}
                />
              )
            })}
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Playback Controls */}
              <button
                onClick={() => seekRelative(-10)}
                className="text-white hover:text-blue-400 transition-colors"
                aria-label="Seek backward 10 seconds"
              >
                <SkipBack className="h-5 w-5" />
              </button>
              
              <button
                onClick={togglePlayPause}
                className="text-white hover:text-blue-400 transition-colors p-2"
                aria-label={playerState.isPlaying ? 'Pause' : 'Play'}
              >
                {playerState.isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </button>
              
              <button
                onClick={() => seekRelative(10)}
                className="text-white hover:text-blue-400 transition-colors"
                aria-label="Seek forward 10 seconds"
              >
                <SkipForward className="h-5 w-5" />
              </button>

              {/* Volume Controls */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-blue-400 transition-colors"
                  aria-label={playerState.isMuted ? 'Unmute' : 'Mute'}
                >
                  {playerState.isMuted || playerState.volume === 0 ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </button>
                
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={playerState.isMuted ? 0 : playerState.volume}
                  onChange={(e) => {
                    const volume = parseFloat(e.target.value)
                    adjustVolume(volume - playerState.volume)
                  }}
                  className="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  aria-label="Volume"
                />
              </div>

              {/* Time Display */}
              <span className="text-white text-sm">
                {formatTime(playerState.currentTime)} / {formatTime(playerState.duration)}
              </span>
            </div>

            {/* Right Controls */}
            <div className="flex items-center space-x-2">
              {/* Playback Speed */}
              <select
                value={playerState.playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-600"
                aria-label="Playback speed"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>

              {/* Settings */}
              <button
                className="text-white hover:text-blue-400 transition-colors"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>

              {/* Fullscreen (Video Only) */}
              {type === 'video' && (
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-blue-400 transition-colors"
                  aria-label="Toggle fullscreen"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Current Transcript Display */}
      {transcript.length > 0 && (
        <div className="absolute top-4 left-4 right-4">
          {(() => {
            const currentSegment = getCurrentTranscriptSegment()
            if (!currentSegment) return null
            
            return (
              <div className="bg-black bg-opacity-75 text-white p-3 rounded-lg">
                {currentSegment.speaker && (
                  <div className="text-sm text-blue-400 mb-1">
                    {currentSegment.speaker}
                  </div>
                )}
                <div className="text-lg">{currentSegment.text}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
})

MediaPlayer.displayName = 'MediaPlayer'

export default MediaPlayer