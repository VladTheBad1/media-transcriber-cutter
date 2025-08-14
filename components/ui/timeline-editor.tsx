'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Scissors, Volume2, VolumeX, Eye, EyeOff, Lock, Unlock, ZoomIn, ZoomOut, Undo, Redo, Play, Pause, Music } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import { VideoThumbnails } from './video-thumbnails'
import { AudioWaveform } from './audio-waveform'

interface TimelineClip {
  id: string
  start: number
  end: number
  duration: number
  type: 'video' | 'audio' | 'text'
  label?: string
  sourceStart?: number
  sourceEnd?: number
  locked?: boolean
  data?: any
}

interface TimelineTrack {
  id: string
  name: string
  type: 'video' | 'audio' | 'text' | 'overlay'
  clips: TimelineClip[]
  height: number
  visible: boolean
  muted?: boolean
  locked?: boolean
}

interface TimelineEditorProps {
  tracks: TimelineTrack[]
  duration: number
  currentTime: number
  isPlaying?: boolean
  playbackRate?: number
  onTimeChange: (time: number) => void
  onPlayPause?: () => void
  onPlaybackRateChange?: (rate: number) => void
  onClipEdit: (trackId: string, clipId: string, updates: Partial<TimelineClip>) => void
  onClipDelete: (trackId: string, clipId: string) => void
  onClipSplit: (trackId: string, clipId: string, splitTime: number) => void
  onTrackToggle: (trackId: string, property: 'visible' | 'muted' | 'locked') => void
  onDetachAudio?: (trackId: string, clipId: string) => void
  onUndo?: () => void
  onRedo?: () => void
  onScrubbingChange?: (isScrubbing: boolean) => void
  className?: string
  pixelsPerSecond?: number
  mediaSrc?: string
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  tracks,
  duration,
  currentTime,
  isPlaying = false,
  playbackRate = 1,
  onTimeChange,
  onPlayPause,
  onPlaybackRateChange,
  onClipEdit,
  onClipDelete,
  onClipSplit,
  onTrackToggle,
  onDetachAudio,
  onUndo,
  onRedo,
  onScrubbingChange,
  className,
  pixelsPerSecond = 20,
  mediaSrc
}) => {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  
  const scaledPixelsPerSecond = pixelsPerSecond * zoom
  const timelineWidth = duration * scaledPixelsPerSecond

  // Handle zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 20))
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 0.1))

  // Handle timeline click for seeking
  const handleTimelineClick = (e: React.MouseEvent) => {
    // Only process if clicked directly on the timeline, not on a clip
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('timeline-track')) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const time = x / scaledPixelsPerSecond
      const clampedTime = Math.max(0, Math.min(time, duration))
      
      if (isPlaying && onPlayPause) {
        onPlayPause()
      }
      
      onTimeChange(clampedTime)
    }
  }
  
  // Handle click on clip area for seeking
  const handleClipAreaClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = x / scaledPixelsPerSecond
    const clampedTime = Math.max(0, Math.min(time, duration))
    
    if (isPlaying && onPlayPause) {
      onPlayPause()
    }
    
    onTimeChange(clampedTime)
  }

  // Render a single clip
  const renderClip = (clip: TimelineClip, track: TimelineTrack) => {
    const clipX = clip.start * scaledPixelsPerSecond
    const clipWidth = clip.duration * scaledPixelsPerSecond
    const clipHeight = track.type === 'text' ? '24px' : '88px'
    
    return (
      <div
        key={clip.id}
        className={cn(
          "absolute rounded-md overflow-hidden shadow-lg border border-gray-700",
          selectedClipId === clip.id && "ring-2 ring-blue-500 border-blue-500",
          (track.locked || clip.locked) && "opacity-60 cursor-not-allowed",
          !(track.locked || clip.locked) && "cursor-move hover:shadow-xl transition-shadow"
        )}
        style={{
          left: clipX,
          top: '50%',
          transform: 'translateY(-50%)',
          width: Math.max(clipWidth, 20),
          height: clipHeight
        }}
        onClick={(e) => {
          // Calculate click position relative to timeline
          const timelineRect = timelineRef.current?.getBoundingClientRect()
          if (timelineRect) {
            const x = e.clientX - timelineRect.left
            const time = x / scaledPixelsPerSecond
            const clampedTime = Math.max(0, Math.min(time, duration))
            
            if (isPlaying && onPlayPause) {
              onPlayPause()
            }
            
            onTimeChange(clampedTime)
          }
          
          // Also select the clip
          setSelectedClipId(clip.id)
        }}
      >
        {/* Video clips - Crystal clear with thumbnails and waveform */}
        {track.type === 'video' && mediaSrc && (
          <div className="absolute inset-0 bg-gray-900">
            {/* Video frames - crystal clear HD quality */}
            <div className="absolute top-0 left-0 right-0" style={{ 
              height: (clip as any).audioDetached ? '100%' : '65%', 
              backgroundColor: '#1a1a1a' 
            }}>
              {clipWidth > 20 && (
                <VideoThumbnails
                  src={mediaSrc}
                  clipStart={clip.start}
                  clipEnd={clip.end}
                  clipWidth={clipWidth}
                  height={(clip as any).audioDetached ? 88 : 57}
                  frameInterval={Math.max(0.1, Math.min(1, clip.duration / (clipWidth / 80)))} // Very high density frames
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            
            {/* Audio waveform - iMovie style gradient - only if audio not detached */}
            {!(clip as any).audioDetached && (
              <div className="absolute bottom-0 left-0 right-0" style={{ 
                height: '35%', 
                background: 'linear-gradient(to bottom, #1e3a8a, #1e40af)',
                borderTop: '1px solid rgba(59, 130, 246, 0.3)'
              }}>
                {clipWidth > 30 && mediaSrc && (
                  <AudioWaveform
                    src={mediaSrc}
                    clipStart={clip.start}
                    clipEnd={clip.end}
                    width={Math.floor(clipWidth)}
                    height={30}
                    className="w-full h-full"
                  />
                )}
              </div>
            )}
            
            {/* Sharp divider line - only if audio not detached */}
            {!(clip as any).audioDetached && (
              <div className="absolute" style={{ 
                top: '65%', 
                left: 0, 
                right: 0, 
                height: '1px', 
                background: 'rgba(59, 130, 246, 0.5)' 
              }} />
            )}
          </div>
        )}
        
        {/* Audio clips - Crystal clear waveform */}
        {track.type === 'audio' && mediaSrc && (
          <div className="absolute inset-0" style={{ 
            background: 'linear-gradient(to bottom, #047857, #059669)' 
          }}>
            {clipWidth > 20 && (
              <AudioWaveform
                src={mediaSrc}
                clipStart={clip.start}
                clipEnd={clip.end}
                width={Math.floor(clipWidth)}
                height={88}
                className="w-full h-full opacity-95"
              />
            )}
          </div>
        )}
        
        {/* Text clips - Single line with full text */}
        {track.type === 'text' && (
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-800 to-yellow-900 flex items-center px-2">
            <span className="text-white text-xs font-medium truncate">
              {clip.label || clip.data?.text || 'Text Clip'}
            </span>
          </div>
        )}
        
        {/* Other clips */}
        {track.type !== 'video' && track.type !== 'audio' && track.type !== 'text' && (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-700 to-gray-800" />
        )}
        
        
        {/* Selection highlight */}
        {selectedClipId === clip.id && (
          <div className="absolute inset-0 border-2 border-blue-500 rounded-md pointer-events-none" />
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full bg-gray-900 overflow-hidden", className)}>
      {/* Header with controls */}
      <div className="relative flex items-center justify-between p-2 border-b border-gray-700">
        {/* Empty left side for balance */}
        <div className="flex-1"></div>
        
        {/* Time display and speed control centered */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2">
          <select
            value={playbackRate}
            onChange={(e) => onPlaybackRateChange?.(parseFloat(e.target.value))}
            className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-sm"
          >
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
          <div className="text-sm text-gray-300 font-mono bg-gray-800 px-3 py-1 rounded">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-end gap-2">
          {/* Zoom controls */}
          <button onClick={handleZoomOut} className="p-1.5 rounded hover:bg-gray-700">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-400">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1.5 rounded hover:bg-gray-700">
            <ZoomIn className="h-4 w-4" />
          </button>

          {/* Undo/Redo */}
          <button onClick={onUndo} className="p-1.5 rounded hover:bg-gray-700">
            <Undo className="h-4 w-4" />
          </button>
          <button onClick={onRedo} className="p-1.5 rounded hover:bg-gray-700">
            <Redo className="h-4 w-4" />
          </button>

          {/* Split tool */}
          <button
            onClick={() => {
              if (selectedClipId) {
                const track = tracks.find(t => t.clips.some(c => c.id === selectedClipId))
                if (track) {
                  onClipSplit(track.id, selectedClipId, currentTime)
                }
              }
            }}
            className="p-1.5 rounded hover:bg-gray-700"
            disabled={!selectedClipId}
          >
            <Scissors className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main timeline area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track controls sidebar */}
        <div className="w-48 border-r border-gray-700 bg-gray-800/30 flex flex-col">
          {/* Track controls - centered vertically */}
          <div className="flex-1 flex items-center">
            <div className="w-full">
              {tracks.map(track => (
                <div key={track.id} className={cn(
                  "flex items-center gap-2 p-2 border-b border-gray-700",
                  track.type === 'text' ? "h-8" : "h-24"
                )}>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-300">
                  {track.type === 'video' ? 'Video' : 
                   track.type === 'audio' ? 'Audio' : 'Text'}
                </div>
                <div className="text-xs text-gray-500">{track.name}</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onTrackToggle(track.id, 'visible')}
                  className="p-1 rounded hover:bg-gray-700"
                  title="Toggle visibility"
                >
                  {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => onTrackToggle(track.id, 'muted')}
                  className="p-1 rounded hover:bg-gray-700"
                  title="Toggle mute"
                >
                  {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => onTrackToggle(track.id, 'locked')}
                  className="p-1 rounded hover:bg-gray-700"
                  title="Toggle lock"
                >
                  {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                </button>
                {/* Detach Audio button - only for video tracks */}
                {track.type === 'video' && track.clips.length > 0 && (
                  <button
                    onClick={() => {
                      // Find the first video clip in the track
                      const videoClip = track.clips.find(c => c.type === 'video')
                      if (videoClip && onDetachAudio) {
                        onDetachAudio(track.id, videoClip.id)
                      }
                    }}
                    className="p-1 rounded hover:bg-gray-700 text-cyan-400"
                    title="Detach audio"
                  >
                    <Music className="h-3 w-3" />
                  </button>
                )}
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>

        {/* Timeline tracks area */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: `${timelineWidth}px`, height: '100%' }} className="flex flex-col">
            {/* Tracks container - centered vertically */}
            <div className="flex-1 flex items-center">
              <div 
                ref={timelineRef}
                onClick={handleTimelineClick}
                className="relative w-full"
              >
                {tracks.map(track => (
                  <div key={track.id} className={cn(
                    "timeline-track border-b border-gray-800 relative",
                    track.type === 'text' ? "h-8" : "h-24"
                  )}
                  onClick={handleClipAreaClick}>
                    {/* Track clips */}
                    {track.clips.map(clip => renderClip(clip, track))}
                  </div>
                ))}
                
                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 pointer-events-none z-20"
                  style={{ left: currentTime * scaledPixelsPerSecond }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TimelineEditor