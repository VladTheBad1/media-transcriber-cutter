'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Scissors, Trash2, Copy, Volume2, Eye, ZoomIn, ZoomOut, RotateCcw, Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { cn, formatTime, clamp, generateId } from '@/lib/utils'
import { WaveformVisualization } from './waveform-visualization'

interface TimelineClip {
  id: string
  start: number
  end: number
  duration: number
  type: 'video' | 'audio' | 'text'
  label?: string
  color?: string
  data?: any
  sourceStart?: number
  sourceEnd?: number
  volume?: number
  opacity?: number
  effects?: TimelineEffect[]
  locked?: boolean
}

interface TimelineEffect {
  id: string
  type: 'fade' | 'transition' | 'filter'
  name: string
  parameters: Record<string, any>
  startTime?: number
  endTime?: number
  enabled: boolean
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
  volume?: number
  opacity?: number
  waveformData?: number[]
  color?: string
}

interface TimelineAction {
  id: string
  type: 'clip_edit' | 'clip_delete' | 'clip_split' | 'clip_merge' | 'track_edit'
  data: any
  timestamp: number
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
  onClipMerge?: (trackId: string, clipId1: string, clipId2: string) => void
  onClipCopy?: (trackId: string, clipId: string) => void
  onTrackToggle: (trackId: string, property: 'visible' | 'muted' | 'locked') => void
  onTrackEdit?: (trackId: string, updates: Partial<TimelineTrack>) => void
  onUndo?: () => void
  onRedo?: () => void
  className?: string
  pixelsPerSecond?: number
  snapToGrid?: boolean
  gridInterval?: number
  showWaveforms?: boolean
  frameRate?: number
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
  onClipMerge,
  onClipCopy,
  onTrackToggle,
  onTrackEdit,
  onUndo,
  onRedo,
  className,
  pixelsPerSecond = 20,
  snapToGrid = true,
  gridInterval = 1,
  showWaveforms = true,
  frameRate = 30
}) => {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragData, setDragData] = useState<{
    clipId: string
    trackId: string
    startX: number
    startTime: number
    type: 'move' | 'resize-start' | 'resize-end'
    originalClip?: TimelineClip
  } | null>(null)
  const [selectedClips, setSelectedClips] = useState<string[]>([])
  const [playheadPosition, setPlayheadPosition] = useState(0)
  const [actionHistory, setActionHistory] = useState<TimelineAction[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    endX: number
    endY: number
  } | null>(null)
  const [clipboardData, setClipboardData] = useState<{
    clips: TimelineClip[]
    trackIds: string[]
  } | null>(null)

  const scaledPixelsPerSecond = pixelsPerSecond * zoom
  const timelineWidth = duration * scaledPixelsPerSecond
  const frameWidth = scaledPixelsPerSecond / frameRate
  
  // Memoized calculations for performance
  const visibleClips = useMemo(() => {
    return tracks.flatMap(track => 
      track.clips.map(clip => ({ ...clip, trackId: track.id, trackType: track.type }))
    )
  }, [tracks])
  
  const canUndo = historyIndex >= 0
  const canRedo = historyIndex < actionHistory.length - 1

  // Update playhead position
  useEffect(() => {
    setPlayheadPosition(currentTime * scaledPixelsPerSecond)
  }, [currentTime, scaledPixelsPerSecond])
  
  // Add action to history for undo/redo
  const addToHistory = useCallback((action: Omit<TimelineAction, 'id' | 'timestamp'>) => {
    const newAction: TimelineAction = {
      id: generateId(),
      timestamp: Date.now(),
      ...action
    }
    
    setActionHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(newAction)
      return newHistory.slice(-50) // Keep last 50 actions
    })
    setHistoryIndex(prev => Math.min(prev + 1, 49))
  }, [historyIndex])
  
  // Handle undo/redo
  const handleUndo = useCallback(() => {
    if (canUndo && onUndo) {
      onUndo()
      setHistoryIndex(prev => prev - 1)
    }
  }, [canUndo, onUndo])
  
  const handleRedo = useCallback(() => {
    if (canRedo && onRedo) {
      onRedo()
      setHistoryIndex(prev => prev + 1)
    }
  }, [canRedo, onRedo])

  // Handle timeline click for seeking
  const handleTimelineClick = (e: React.MouseEvent) => {
    // Debug logging
    console.log('Timeline click event triggered', {
      isDragging,
      isSelecting,
      target: e.target,
      currentTarget: e.currentTarget
    })
    
    if (isDragging || isSelecting) {
      console.log('Click ignored - dragging or selecting')
      return
    }
    
    // Check if we clicked on a clip or other interactive element
    const target = e.target as HTMLElement
    if (target.closest('[data-clip]') || target.closest('button')) {
      console.log('Click ignored - on interactive element')
      return // Don't seek if clicking on interactive elements
    }
    
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    if (!rect) {
      console.log('Click ignored - no rect')
      return
    }
    
    // Account for track header width (128px) and scroll position
    const scrollLeft = container.parentElement?.scrollLeft || 0
    const clickX = e.clientX - rect.left + scrollLeft - 128
    
    // Don't process clicks on the track header area
    if (clickX < 0) {
      console.log('Click ignored - in header area')
      return
    }
    
    let newTime = clickX / scaledPixelsPerSecond
    
    if (snapToGrid) {
      newTime = Math.round(newTime / gridInterval) * gridInterval
    }
    
    // Frame-accurate seeking
    if (frameRate) {
      newTime = Math.round(newTime * frameRate) / frameRate
    }
    
    const clampedTime = clamp(newTime, 0, duration)
    console.log('Timeline clicked - seeking to:', clampedTime, 'from click X:', clickX)
    onTimeChange(clampedTime)
  }

  // Snap to grid helper with frame accuracy
  const snapTime = useCallback((time: number) => {
    let snappedTime = time
    
    if (snapToGrid) {
      snappedTime = Math.round(time / gridInterval) * gridInterval
    }
    
    // Frame-accurate snapping
    if (frameRate) {
      snappedTime = Math.round(snappedTime * frameRate) / frameRate
    }
    
    return snappedTime
  }, [snapToGrid, gridInterval, frameRate])

  // Handle clip mouse down
  const handleClipMouseDown = (
    e: React.MouseEvent,
    clipId: string,
    trackId: string,
    type: 'move' | 'resize-start' | 'resize-end'
  ) => {
    e.preventDefault()
    e.stopPropagation()
    
    const track = tracks.find(t => t.id === trackId)
    const clip = track?.clips.find(c => c.id === clipId)
    if (!clip || track?.locked || clip.locked) return
    
    setIsDragging(true)
    setDragData({
      clipId,
      trackId,
      startX: e.clientX,
      startTime: type === 'resize-end' ? clip.end : clip.start,
      type,
      originalClip: { ...clip }
    })
    
    // Select clip if not already selected
    if (!selectedClips.includes(clipId)) {
      if (e.ctrlKey || e.metaKey) {
        setSelectedClips(prev => [...prev, clipId])
      } else {
        setSelectedClips([clipId])
      }
    }
  }

  // Handle mouse move for dragging and selection
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && dragData) {
      const deltaX = e.clientX - dragData.startX
      const deltaTime = deltaX / scaledPixelsPerSecond
      
      const track = tracks.find(t => t.id === dragData.trackId)
      const clip = track?.clips.find(c => c.id === dragData.clipId)
      if (!clip || !dragData.originalClip) return
      
      let updates: Partial<TimelineClip> = {}
      const minClipDuration = 1 / frameRate // One frame minimum
      
      switch (dragData.type) {
        case 'move': {
          const newStart = snapTime(dragData.startTime + deltaTime)
          const clampedStart = clamp(newStart, 0, duration - clip.duration)
          
          // Check for collisions with other clips
          const otherClips = track.clips.filter(c => c.id !== clip.id)
          let collisionFound = false
          
          for (const otherClip of otherClips) {
            if (clampedStart < otherClip.end && (clampedStart + clip.duration) > otherClip.start) {
              collisionFound = true
              break
            }
          }
          
          if (!collisionFound) {
            updates = {
              start: clampedStart,
              end: clampedStart + clip.duration
            }
          }
          break
        }
        case 'resize-start': {
          const newStart = snapTime(dragData.startTime + deltaTime)
          const maxStart = clip.end - minClipDuration
          const clampedStart = clamp(newStart, 0, maxStart)
          
          updates = {
            start: clampedStart,
            duration: clip.end - clampedStart
          }
          
          // Update source timing if available
          if (clip.sourceStart !== undefined) {
            const sourceDelta = clampedStart - dragData.originalClip.start
            updates.sourceStart = dragData.originalClip.sourceStart + sourceDelta
          }
          break
        }
        case 'resize-end': {
          const newEnd = snapTime(dragData.startTime + deltaTime)
          const minEnd = clip.start + minClipDuration
          const clampedEnd = clamp(newEnd, minEnd, duration)
          
          updates = {
            end: clampedEnd,
            duration: clampedEnd - clip.start
          }
          
          // Update source timing if available
          if (clip.sourceEnd !== undefined) {
            const sourceDelta = clampedEnd - dragData.originalClip.end
            updates.sourceEnd = dragData.originalClip.sourceEnd + sourceDelta
          }
          break
        }
      }
      
      if (Object.keys(updates).length > 0) {
        onClipEdit(dragData.trackId, dragData.clipId, updates)
      }
    } else if (isSelecting && selectionBox) {
      // Update selection box
      setSelectionBox(prev => prev ? {
        ...prev,
        endX: e.clientX,
        endY: e.clientY
      } : null)
    }
  }, [isDragging, dragData, isSelecting, selectionBox, scaledPixelsPerSecond, snapTime, tracks, duration, onClipEdit, frameRate])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    console.log('Mouse up - resetting drag states')
    
    if (isDragging && dragData) {
      // Add drag action to history
      addToHistory({
        type: 'clip_edit',
        data: { trackId: dragData.trackId, clipId: dragData.clipId, originalClip: dragData.originalClip }
      })
    }
    
    if (isSelecting && selectionBox) {
      // Select clips within selection box
      const rect = timelineRef.current?.getBoundingClientRect()
      if (rect) {
        const selectedClipIds: string[] = []
        
        tracks.forEach((track, trackIndex) => {
          const trackY = trackIndex * track.height
          
          track.clips.forEach(clip => {
            const clipX = clip.start * scaledPixelsPerSecond + 128 // Account for header
            const clipWidth = clip.duration * scaledPixelsPerSecond
            const clipY = trackY
            
            const boxLeft = Math.min(selectionBox.startX, selectionBox.endX) - rect.left
            const boxRight = Math.max(selectionBox.startX, selectionBox.endX) - rect.left
            const boxTop = Math.min(selectionBox.startY, selectionBox.endY) - rect.top
            const boxBottom = Math.max(selectionBox.startY, selectionBox.endY) - rect.top
            
            if (clipX < boxRight && clipX + clipWidth > boxLeft &&
                clipY < boxBottom && clipY + track.height > boxTop) {
              selectedClipIds.push(clip.id)
            }
          })
        })
        
        setSelectedClips(selectedClipIds)
      }
    }
    
    // Always reset these states
    setIsDragging(false)
    setDragData(null)
    setIsSelecting(false)
    setSelectionBox(null)
  }, [isDragging, dragData, isSelecting, selectionBox, tracks, scaledPixelsPerSecond, addToHistory])

  // Add event listeners
  useEffect(() => {
    if (isDragging || isSelecting) {
      console.log('Adding mouse event listeners')
      
      const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e)
      const handleGlobalMouseUp = () => {
        console.log('Global mouse up triggered')
        handleMouseUp()
      }
      
      document.addEventListener('mousemove', handleGlobalMouseMove)
      document.addEventListener('mouseup', handleGlobalMouseUp)
      
      return () => {
        console.log('Removing mouse event listeners')
        document.removeEventListener('mousemove', handleGlobalMouseMove)
        document.removeEventListener('mouseup', handleGlobalMouseUp)
      }
    }
  }, [isDragging, isSelecting, handleMouseMove, handleMouseUp])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      const isCtrl = e.ctrlKey || e.metaKey
      const isShift = e.shiftKey
      
      switch (e.key.toLowerCase()) {
        case 'delete':
        case 'backspace':
          if (selectedClips.length > 0) {
            selectedClips.forEach(clipId => {
              const track = tracks.find(t => t.clips.some(c => c.id === clipId))
              if (track && !track.locked) {
                const clip = track.clips.find(c => c.id === clipId)
                if (clip && !clip.locked) {
                  onClipDelete(track.id, clipId)
                }
              }
            })
            setSelectedClips([])
            addToHistory({ type: 'clip_delete', data: { clipIds: selectedClips } })
          }
          break
          
        case 'c':
          if (isCtrl && selectedClips.length > 0) {
            e.preventDefault()
            const clipsToCopy: { clip: TimelineClip, trackId: string }[] = []
            selectedClips.forEach(clipId => {
              const track = tracks.find(t => t.clips.some(c => c.id === clipId))
              const clip = track?.clips.find(c => c.id === clipId)
              if (track && clip) {
                clipsToCopy.push({ clip, trackId: track.id })
              }
            })
            if (clipsToCopy.length > 0) {
              setClipboardData({
                clips: clipsToCopy.map(({ clip }) => clip),
                trackIds: clipsToCopy.map(({ trackId }) => trackId)
              })
            }
          }
          break
          
        case 'v':
          if (isCtrl && clipboardData) {
            e.preventDefault()
            // Paste clips at playhead position
            clipboardData.clips.forEach((clip, index) => {
              if (onClipCopy && clipboardData.trackIds[index]) {
                onClipCopy(clipboardData.trackIds[index], clip.id)
              }
            })
          }
          break
          
        case 's':
          if (isCtrl && !isShift) {
            // Split at playhead
            e.preventDefault()
            selectedClips.forEach(clipId => {
              const track = tracks.find(t => t.clips.some(c => c.id === clipId))
              const clip = track?.clips.find(c => c.id === clipId)
              if (track && clip && !track.locked && !clip.locked &&
                  currentTime >= clip.start && currentTime <= clip.end) {
                onClipSplit(track.id, clipId, currentTime)
              }
            })
            addToHistory({ type: 'clip_split', data: { clipIds: selectedClips, splitTime: currentTime } })
          }
          break
          
        case 'j':
          // J/K/L playback controls
          if (onPlaybackRateChange) {
            onPlaybackRateChange(-1) // Reverse playback
          }
          break
          
        case 'k':
          if (onPlayPause) {
            onPlayPause()
          }
          break
          
        case 'l':
          if (onPlaybackRateChange) {
            onPlaybackRateChange(isShift ? 2 : 1) // Fast forward
          }
          break
          
        case ' ':
          e.preventDefault()
          if (onPlayPause) {
            onPlayPause()
          }
          break
          
        case 'arrowleft':
          e.preventDefault()
          const stepBackward = isShift ? 10 : (isCtrl ? 1/frameRate : 1)
          onTimeChange(Math.max(0, currentTime - stepBackward))
          break
          
        case 'arrowright':
          e.preventDefault()
          const stepForward = isShift ? 10 : (isCtrl ? 1/frameRate : 1)
          onTimeChange(Math.min(duration, currentTime + stepForward))
          break
          
        case 'home':
          e.preventDefault()
          onTimeChange(0)
          break
          
        case 'end':
          e.preventDefault()
          onTimeChange(duration)
          break
          
        case 'z':
          if (isCtrl && !isShift && canUndo) {
            e.preventDefault()
            handleUndo()
          } else if (isCtrl && isShift && canRedo) {
            e.preventDefault()
            handleRedo()
          }
          break
          
        case 'y':
          if (isCtrl && canRedo) {
            e.preventDefault()
            handleRedo()
          }
          break
          
        case 'a':
          if (isCtrl) {
            e.preventDefault()
            // Select all clips
            const allClipIds = tracks.flatMap(track => track.clips.map(clip => clip.id))
            setSelectedClips(allClipIds)
          }
          break
          
        case 'escape':
          setSelectedClips([])
          break
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedClips, tracks, currentTime, isPlaying, playbackRate, canUndo, canRedo, clipboardData, frameRate, duration, onClipDelete, onClipSplit, onClipCopy, onPlayPause, onPlaybackRateChange, onTimeChange, handleUndo, handleRedo, addToHistory])

  // Zoom controls with frame-accurate positioning
  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(prev * 1.5, 20)
      // Maintain playhead position during zoom
      if (timelineRef.current) {
        const containerWidth = timelineRef.current.clientWidth - 128
        const playheadX = currentTime * pixelsPerSecond * newZoom
        const scrollLeft = playheadX - containerWidth / 2
        timelineRef.current.scrollLeft = Math.max(0, scrollLeft)
      }
      return newZoom
    })
  }, [currentTime, pixelsPerSecond])
  
  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.5, 0.1))
  }, [])
  
  const handleZoomFit = useCallback(() => {
    const containerWidth = timelineRef.current?.clientWidth || 800
    setZoom((containerWidth - 128) / (duration * pixelsPerSecond))
  }, [duration, pixelsPerSecond])
  
  // Auto-scroll to keep playhead visible
  useEffect(() => {
    if (isPlaying && timelineRef.current) {
      const container = timelineRef.current
      const containerWidth = container.clientWidth - 128
      const playheadX = playheadPosition
      const scrollLeft = container.scrollLeft
      
      if (playheadX < scrollLeft || playheadX > scrollLeft + containerWidth) {
        container.scrollLeft = Math.max(0, playheadX - containerWidth / 2)
      }
    }
  }, [isPlaying, playheadPosition])

  // Generate time ruler with frame markers
  const generateTimeRuler = useMemo(() => {
    const markers = []
    let interval = Math.max(1, Math.floor(10 / zoom)) // Adaptive interval based on zoom
    
    // Show frame markers at high zoom levels
    const showFrames = zoom > 5 && frameRate > 0
    if (showFrames) {
      interval = 1 / frameRate
    }
    
    for (let time = 0; time <= duration; time += interval) {
      const x = time * scaledPixelsPerSecond
      const isSecond = time % 1 === 0
      const isFrame = showFrames && !isSecond
      
      markers.push(
        <div
          key={`${time}-${interval}`}
          className={cn(
            "absolute top-0 bottom-0 border-l text-xs",
            isSecond ? "border-gray-400" : "border-gray-600",
            isFrame ? "border-dotted" : "border-solid"
          )}
          style={{ left: x }}
        >
          {(isSecond || (showFrames && time % (1/frameRate * 5) === 0)) && (
            <span className="absolute top-1 left-1 bg-gray-800 px-1 rounded text-gray-300">
              {showFrames && !isSecond 
                ? `${Math.round(time * frameRate)}f`
                : formatTime(time)
              }
            </span>
          )}
        </div>
      )
    }
    
    return markers
  }, [duration, scaledPixelsPerSecond, zoom, frameRate])

  return (
    <div className={cn("bg-gray-900 rounded-lg border border-gray-700", className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-200">Timeline Editor</h3>
            <div className="text-sm text-gray-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Transport Controls */}
            <div className="flex items-center gap-1 border border-gray-600 rounded">
              <button
                onClick={() => onTimeChange(Math.max(0, currentTime - 10))}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                aria-label="Skip backward 10s"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              
              {onPlayPause && (
                <button
                  onClick={onPlayPause}
                  className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              )}
              
              <button
                onClick={() => onTimeChange(Math.min(duration, currentTime + 10))}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                aria-label="Skip forward 10s"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              
              {onPlaybackRateChange && (
                <select
                  value={playbackRate}
                  onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
                  className="bg-gray-700 text-gray-200 text-xs px-2 py-1 border-l border-gray-600 focus:outline-none"
                >
                  <option value={0.25}>0.25x</option>
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                </select>
              )}
            </div>
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border border-gray-600 rounded">
              <button
                onClick={handleZoomOut}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="px-2 py-1 text-xs text-gray-400 min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={handleZoomFit}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors border-l border-gray-600"
                aria-label="Fit to view"
              >
                Fit
              </button>
            </div>

            {/* Editing Tools */}
            <div className="flex items-center gap-1 border border-gray-600 rounded">
              <button
                onClick={() => {
                  // First try to split selected clips
                  let splitCount = 0
                  
                  if (selectedClips.length > 0) {
                    selectedClips.forEach(clipId => {
                      const track = tracks.find(t => t.clips.some(c => c.id === clipId))
                      const clip = track?.clips.find(c => c.id === clipId)
                      if (track && clip && !track.locked && !clip.locked &&
                          currentTime >= clip.start && currentTime <= clip.end) {
                        onClipSplit(track.id, clipId, currentTime)
                        splitCount++
                      }
                    })
                  }
                  
                  // If no selected clips were split, find any clip at playhead position
                  if (splitCount === 0) {
                    tracks.forEach(track => {
                      if (!track.locked) {
                        track.clips.forEach(clip => {
                          if (!clip.locked && currentTime > clip.start && currentTime < clip.end) {
                            console.log('Splitting unselected clip:', clip.id, 'at', currentTime)
                            onClipSplit(track.id, clip.id, currentTime)
                            splitCount++
                          }
                        })
                      }
                    })
                  }
                  
                  if (splitCount > 0) {
                    addToHistory({ type: 'clip_split', data: { clipIds: selectedClips, splitTime: currentTime } })
                  }
                }}
                className={cn(
                  "p-2 transition-colors",
                  // Check if there's any clip at current time that can be split
                  tracks.some(track => 
                    !track.locked && track.clips.some(clip => 
                      !clip.locked && currentTime > clip.start && currentTime < clip.end
                    )
                  )
                    ? "text-blue-400 hover:text-blue-300 hover:bg-gray-700"
                    : "text-gray-500 cursor-not-allowed"
                )}
                aria-label="Split clip at playhead"
                title="Split clip at playhead (S)"
                disabled={!tracks.some(track => 
                  !track.locked && track.clips.some(clip => 
                    !clip.locked && currentTime > clip.start && currentTime < clip.end
                  )
                )}
              >
                <Scissors className="h-4 w-4" />
              </button>
              
              <button
                onClick={() => {
                  if (selectedClips.length > 0 && onClipCopy) {
                    const clipsToCopy: { clip: TimelineClip, trackId: string }[] = []
                    selectedClips.forEach(clipId => {
                      const track = tracks.find(t => t.clips.some(c => c.id === clipId))
                      const clip = track?.clips.find(c => c.id === clipId)
                      if (track && clip) {
                        clipsToCopy.push({ clip, trackId: track.id })
                      }
                    })
                    if (clipsToCopy.length > 0) {
                      setClipboardData({
                        clips: clipsToCopy.map(({ clip }) => clip),
                        trackIds: clipsToCopy.map(({ trackId }) => trackId)
                      })
                    }
                  }
                }}
                className={cn(
                  "p-2 transition-colors",
                  selectedClips.length > 0
                    ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                    : "text-gray-500 cursor-not-allowed"
                )}
                aria-label="Copy clips"
                disabled={selectedClips.length === 0}
              >
                <Copy className="h-4 w-4" />
              </button>
              
              <button
                onClick={() => {
                  selectedClips.forEach(clipId => {
                    const track = tracks.find(t => t.clips.some(c => c.id === clipId))
                    if (track && !track.locked) {
                      const clip = track.clips.find(c => c.id === clipId)
                      if (clip && !clip.locked) {
                        onClipDelete(track.id, clipId)
                      }
                    }
                  })
                  addToHistory({ type: 'clip_delete', data: { clipIds: selectedClips } })
                  setSelectedClips([])
                }}
                className={cn(
                  "p-2 transition-colors",
                  selectedClips.length > 0
                    ? "text-red-400 hover:text-red-300 hover:bg-gray-700"
                    : "text-gray-500 cursor-not-allowed"
                )}
                aria-label="Delete clips"
                disabled={selectedClips.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            
            {/* Undo/Redo */}
            {(onUndo || onRedo) && (
              <div className="flex items-center gap-1 border border-gray-600 rounded">
                <button
                  onClick={handleUndo}
                  className={cn(
                    "p-2 transition-colors",
                    canUndo
                      ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                      : "text-gray-500 cursor-not-allowed"
                  )}
                  aria-label="Undo"
                  disabled={!canUndo}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                
                <button
                  onClick={handleRedo}
                  className={cn(
                    "p-2 transition-colors",
                    canRedo
                      ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                      : "text-gray-500 cursor-not-allowed"
                  )}
                  aria-label="Redo"
                  disabled={!canRedo}
                >
                  <RotateCcw className="h-4 w-4 scale-x-[-1]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="relative">
        {/* Time Ruler */}
        <div className="h-10 bg-gray-800 border-b border-gray-700 relative overflow-hidden">
          {/* Track Headers Spacer */}
          <div className="absolute left-0 top-0 w-32 h-full bg-gray-800 border-r border-gray-700 z-10 flex items-center justify-center">
            <span className="text-xs text-gray-500">Time</span>
          </div>
          
          <div
            className="relative h-full ml-32"
            style={{ width: Math.max(timelineWidth, 800) + 'px' }}
          >
            {generateTimeRuler}
          </div>
        </div>

        {/* Tracks Container */}
        <div className="relative overflow-x-auto overflow-y-visible">
          <div
            ref={timelineRef}
            className="relative bg-gray-850 cursor-crosshair"
            style={{ width: Math.max(timelineWidth, 800) + 'px', minHeight: tracks.length * 80 }}
            onClick={(e) => {
              // Handle clicks on the timeline
              handleTimelineClick(e)
            }}
            onMouseDown={(e) => {
              // Check if we're clicking on empty space (not a clip)
              const target = e.target as HTMLElement
              const isEmptySpace = target === e.currentTarget || 
                                  target.classList.contains('timeline-track') ||
                                  target.classList.contains('timeline-grid')
              
              if (isEmptySpace && e.button === 0) { // Left click only
                // Prevent drag selection on empty space
                e.preventDefault()
              }
            }}
            title="Click to seek"
          >
            {/* Grid Lines */}
            {snapToGrid && (
              <div className="absolute inset-0 pointer-events-none timeline-grid">
                {Array.from({ length: Math.ceil(duration / gridInterval) }).map((_, i) => {
                  const time = i * gridInterval
                  const x = time * scaledPixelsPerSecond
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-gray-700 opacity-30"
                      style={{ left: x }}
                    />
                  )
                })}
              </div>
            )}

            {/* Tracks */}
            {tracks.map((track, trackIndex) => (
              <div
                key={track.id}
                className="relative border-b border-gray-700"
                style={{ height: track.height }}
              >
                {/* Track Header */}
                <div className={cn(
                  "absolute left-0 top-0 w-32 h-full border-r border-gray-700 flex flex-col justify-center p-2 z-10 transition-colors",
                  track.locked ? "bg-gray-750" : "bg-gray-800",
                  track.color && `border-l-2 border-l-${track.color}-400`
                )}>
                  <div className="text-sm font-medium text-gray-200 truncate mb-1 flex items-center gap-1">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      track.type === 'video' ? "bg-blue-400" :
                      track.type === 'audio' ? "bg-green-400" :
                      track.type === 'text' ? "bg-yellow-400" : "bg-purple-400"
                    )} />
                    {track.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onTrackToggle(track.id, 'visible')}
                      className={cn(
                        "p-1 rounded transition-colors",
                        track.visible ? "text-blue-400 hover:text-blue-300" : "text-gray-500 hover:text-gray-400"
                      )}
                      aria-label={track.visible ? "Hide track" : "Show track"}
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    {(track.type === 'audio' || track.type === 'video') && (
                      <button
                        onClick={() => onTrackToggle(track.id, 'muted')}
                        className={cn(
                          "p-1 rounded transition-colors",
                          !track.muted ? "text-blue-400 hover:text-blue-300" : "text-gray-500 hover:text-gray-400"
                        )}
                        aria-label={track.muted ? "Unmute track" : "Mute track"}
                      >
                        <Volume2 className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => onTrackToggle(track.id, 'locked')}
                      className={cn(
                        "p-1 rounded transition-colors",
                        track.locked ? "text-red-400 hover:text-red-300" : "text-gray-500 hover:text-gray-400"
                      )}
                      aria-label={track.locked ? "Unlock track" : "Lock track"}
                    >
                      <div className={cn(
                        "w-3 h-3 border border-current rounded",
                        track.locked ? "border-t-2" : ""
                      )} />
                    </button>
                  </div>
                </div>

                {/* Track Content */}
                <div className="relative ml-32 h-full timeline-track">
                  {/* Waveform Background for Audio Tracks */}
                  {showWaveforms && track.type === 'audio' && track.waveformData && track.visible && (
                    <WaveformVisualization
                      waveformData={track.waveformData}
                      duration={duration}
                      width={timelineWidth}
                      height={track.height - 2}
                      color={track.color || 'green'}
                      opacity={0.3}
                    />
                  )}
                  {/* Clips */}
                  {track.clips.map((clip) => {
                    const clipX = clip.start * scaledPixelsPerSecond
                    const clipWidth = clip.duration * scaledPixelsPerSecond
                    const isSelected = selectedClips.includes(clip.id)

                    return (
                      <div
                        key={clip.id}
                        data-clip={clip.id}
                        className={cn(
                          "absolute top-1 bottom-1 rounded border-2 transition-all flex items-center justify-between px-2 overflow-hidden",
                          isSelected
                            ? "border-blue-400 bg-blue-900/50 shadow-lg shadow-blue-400/20"
                            : "border-gray-500 bg-gray-700 hover:border-gray-400",
                          clip.color && `bg-${clip.color}-900/50 border-${clip.color}-400`,
                          track.locked || clip.locked 
                            ? "cursor-not-allowed opacity-60" 
                            : "cursor-move",
                          dragData?.clipId === clip.id && "ring-2 ring-blue-400/50"
                        )}
                        style={{
                          left: clipX,
                          width: Math.max(clipWidth, 20)
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          if (!track.locked && !clip.locked) {
                            handleClipMouseDown(e, clip.id, track.id, 'move')
                          }
                        }}
                      >
                        {/* Resize Handle - Start */}
                        {!track.locked && !clip.locked && (
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity z-10"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleClipMouseDown(e, clip.id, track.id, 'resize-start')
                            }}
                          />
                        )}

                        {/* Clip Content */}
                        <div className="flex-1 min-w-0 text-xs text-gray-200 truncate flex items-center gap-1">
                          {clip.locked && (
                            <div className="w-3 h-3 border border-gray-400 rounded border-t-2" />
                          )}
                          <span>{clip.label || `${track.type} clip`}</span>
                          {clip.effects && clip.effects.length > 0 && (
                            <span className="text-purple-400">●</span>
                          )}
                        </div>
                        
                        {/* Volume/Opacity Indicator */}
                        {(clip.volume !== undefined && clip.volume !== 1) || (clip.opacity !== undefined && clip.opacity !== 1) && (
                          <div className="text-xs text-gray-400">
                            {clip.volume !== undefined && clip.volume !== 1 && `${Math.round(clip.volume * 100)}%`}
                            {clip.opacity !== undefined && clip.opacity !== 1 && `α${Math.round(clip.opacity * 100)}%`}
                          </div>
                        )}

                        {/* Resize Handle - End */}
                        {!track.locked && !clip.locked && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity z-10"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleClipMouseDown(e, clip.id, track.id, 'resize-end')
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Selection Box */}
            {selectionBox && (
              <div
                className="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none z-30"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.endX) - (timelineRef.current?.getBoundingClientRect().left || 0),
                  top: Math.min(selectionBox.startY, selectionBox.endY) - (timelineRef.current?.getBoundingClientRect().top || 0),
                  width: Math.abs(selectionBox.endX - selectionBox.startX),
                  height: Math.abs(selectionBox.endY - selectionBox.startY)
                }}
              />
            )}
            
            {/* Playhead - Now Draggable */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-red-500 z-40 shadow-lg cursor-col-resize hover:w-2 hover:bg-red-400 transition-all group"
              style={{ left: playheadPosition + 128 }}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                
                const startX = e.clientX
                const startPosition = playheadPosition
                
                const handlePlayheadDrag = (moveEvent: MouseEvent) => {
                  const deltaX = moveEvent.clientX - startX
                  let newPosition = startPosition + deltaX
                  
                  // Clamp to timeline bounds
                  newPosition = Math.max(0, Math.min(newPosition, timelineWidth))
                  
                  // Convert position to time
                  const newTime = newPosition / scaledPixelsPerSecond
                  
                  // Use the existing snapTime function for consistency
                  const snappedTime = snapTime(newTime)
                  
                  // Update playhead and seek
                  onTimeChange(Math.min(Math.max(snappedTime, 0), duration))
                }
                
                const handlePlayheadDragEnd = () => {
                  document.removeEventListener('mousemove', handlePlayheadDrag)
                  document.removeEventListener('mouseup', handlePlayheadDragEnd)
                  document.body.style.cursor = ''
                }
                
                document.addEventListener('mousemove', handlePlayheadDrag)
                document.addEventListener('mouseup', handlePlayheadDragEnd)
                document.body.style.cursor = 'col-resize'
              }}
              title="Drag to seek"
            >
              {/* Top Handle */}
              <div className="absolute -top-3 -left-3 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center cursor-col-resize group-hover:scale-125 group-hover:bg-red-400 transition-all">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              {/* Bottom Handle */}
              <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center cursor-col-resize group-hover:scale-125 group-hover:bg-red-400 transition-all">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              {/* Center Line Extension for Better Grabbing */}
              <div className="absolute top-0 bottom-0 -left-2 w-4 cursor-col-resize" />
              {/* Time Label on Hover */}
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                {formatTime(currentTime)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            {frameRate > 0 && (
              <span>
                Frame: {Math.round(currentTime * frameRate)}/{Math.round(duration * frameRate)}
              </span>
            )}
            {selectedClips.length > 0 && (
              <span className="text-blue-400">
                {selectedClips.length} clip{selectedClips.length > 1 ? 's' : ''} selected
              </span>
            )}
            {clipboardData && (
              <span className="text-green-400">
                {clipboardData.clips.length} clip{clipboardData.clips.length > 1 ? 's' : ''} copied
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            <span>Grid: {snapToGrid ? `${gridInterval}s` : 'Off'}</span>
            {frameRate > 0 && (
              <span>{frameRate}fps</span>
            )}
            <div className="flex items-center gap-2">
              <span>Shortcuts:</span>
              <span className="font-mono bg-gray-700 px-1 rounded">Space</span>
              <span>Play/Pause</span>
              <span className="font-mono bg-gray-700 px-1 rounded">J/K/L</span>
              <span>Playback</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TimelineEditor

// Keyboard shortcuts component for help display
export const KeyboardShortcuts: React.FC = () => {
  return (
    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
      <h4 className="font-semibold text-gray-200 mb-3">Keyboard Shortcuts</h4>
      <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
        <div>
          <h5 className="font-medium text-gray-300 mb-2">Playback</h5>
          <div className="space-y-1">
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Space</kbd> Play/Pause</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">J</kbd> Reverse</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">K</kbd> Pause</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">L</kbd> Forward</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">←/→</kbd> Step 1s</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Ctrl+←/→</kbd> Step 1 frame</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Shift+←/→</kbd> Step 10s</div>
          </div>
        </div>
        <div>
          <h5 className="font-medium text-gray-300 mb-2">Editing</h5>
          <div className="space-y-1">
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Ctrl+S</kbd> Split at playhead</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Delete</kbd> Delete selected</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Ctrl+C</kbd> Copy</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Ctrl+V</kbd> Paste</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Ctrl+Z</kbd> Undo</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Ctrl+Y</kbd> Redo</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Ctrl+A</kbd> Select all</div>
            <div><kbd className="font-mono bg-gray-800 px-1 rounded">Esc</kbd> Clear selection</div>
          </div>
        </div>
      </div>
    </div>
  )
}