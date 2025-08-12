'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { 
  TimelineData, 
  TimelineTrack, 
  TimelineClip, 
  TimelineAction,
  snapToFrame,
  validateClipOverlap,
  findClipAt 
} from '../services/timeline-service'

export interface UseTimelineOptions {
  frameRate?: number
  autoSave?: boolean
  autoSaveDelay?: number
  maxHistorySize?: number
}

export interface TimelineState {
  timeline: TimelineData | null
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  selectedClips: string[]
  isLoading: boolean
  error: string | null
  isDirty: boolean
  zoomLevel: number
  snapToGrid: boolean
  gridInterval: number
}

export interface UseTimelineReturn extends TimelineState {
  // Playback controls
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  seek: (time: number) => void
  setPlaybackRate: (rate: number) => void
  
  // Timeline operations
  loadTimeline: (timelineId: string) => Promise<void>
  saveTimeline: () => Promise<void>
  
  // Clip operations
  addClip: (trackId: string, clipData: Omit<TimelineClip, 'id'>) => Promise<void>
  updateClip: (trackId: string, clipId: string, updates: Partial<TimelineClip>) => void
  deleteClip: (trackId: string, clipId: string) => void
  splitClip: (trackId: string, clipId: string, splitTime: number) => void
  mergeClips: (trackId: string, clipId1: string, clipId2: string) => void
  copyClips: (clipIds: string[]) => void
  pasteClips: (targetTime?: number) => void
  
  // Track operations
  addTrack: (trackData: Omit<TimelineTrack, 'id' | 'clips'>) => void
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void
  deleteTrack: (trackId: string) => void
  toggleTrackProperty: (trackId: string, property: 'visible' | 'muted' | 'locked') => void
  
  // Selection
  selectClips: (clipIds: string[]) => void
  addToSelection: (clipId: string) => void
  removeFromSelection: (clipId: string) => void
  clearSelection: () => void
  selectAll: () => void
  
  // Timeline settings
  setZoom: (zoom: number) => void
  setSnapToGrid: (enabled: boolean) => void
  setGridInterval: (interval: number) => void
  
  // History
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  
  // Utilities
  getClipAt: (time: number, trackId?: string) => TimelineClip | null
  getSelectedClipsData: () => { clip: TimelineClip; trackId: string }[]
  exportData: () => Promise<any>
}

export const useTimeline = (options: UseTimelineOptions = {}): UseTimelineReturn => {
  const {
    frameRate = 30,
    autoSave = true,
    autoSaveDelay = 2000,
    maxHistorySize = 50
  } = options

  // State
  const [state, setState] = useState<TimelineState>({
    timeline: null,
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
    selectedClips: [],
    isLoading: false,
    error: null,
    isDirty: false,
    zoomLevel: 1,
    snapToGrid: true,
    gridInterval: 1
  })

  // History management
  const [actionHistory, setActionHistory] = useState<TimelineAction[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const clipboardRef = useRef<{ clips: TimelineClip[]; trackIds: string[] } | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout>()
  const playbackTimerRef = useRef<NodeJS.Timeout>()

  // Computed values
  const canUndo = historyIndex >= 0
  const canRedo = historyIndex < actionHistory.length - 1

  // Auto-save functionality
  const scheduleAutoSave = useCallback(() => {
    if (!autoSave) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(() => {
      if (state.isDirty && state.timeline) {
        // Auto-save logic would go here
        console.log('Auto-saving timeline...')
      }
    }, autoSaveDelay)
  }, [autoSave, autoSaveDelay, state.isDirty, state.timeline])

  // Add action to history
  const addToHistory = useCallback((action: Omit<TimelineAction, 'id' | 'timestamp'>) => {
    const newAction: TimelineAction = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      ...action
    }

    setActionHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(newAction)
      return newHistory.slice(-maxHistorySize)
    })
    
    setHistoryIndex(prev => Math.min(prev + 1, maxHistorySize - 1))
    
    setState(prev => ({ ...prev, isDirty: true }))
    scheduleAutoSave()
  }, [historyIndex, maxHistorySize, scheduleAutoSave])

  // Update timeline state
  const updateTimeline = useCallback((updater: (timeline: TimelineData) => TimelineData) => {
    setState(prev => {
      if (!prev.timeline) return prev
      return {
        ...prev,
        timeline: updater(prev.timeline),
        isDirty: true
      }
    })
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Playback controls
  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }))
    
    const startTime = Date.now()
    const initialCurrentTime = state.currentTime
    
    const updatePlayhead = () => {
      if (!state.isPlaying) return
      
      const elapsed = (Date.now() - startTime) / 1000 * state.playbackRate
      const newTime = initialCurrentTime + elapsed
      
      if (state.timeline && newTime >= state.timeline.duration) {
        pause()
        seek(state.timeline.duration)
        return
      }
      
      setState(prev => ({ ...prev, currentTime: newTime }))
      playbackTimerRef.current = setTimeout(updatePlayhead, 16) // ~60fps
    }
    
    updatePlayhead()
  }, [state.currentTime, state.playbackRate, state.timeline])

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }))
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current)
    }
  }, [])

  const togglePlayPause = useCallback(() => {
    if (state.isPlaying) {
      pause()
    } else {
      play()
    }
  }, [state.isPlaying, play, pause])

  const seek = useCallback((time: number) => {
    if (!state.timeline) return
    
    const clampedTime = Math.max(0, Math.min(time, state.timeline.duration))
    const snappedTime = state.snapToGrid ? snapToFrame(clampedTime, frameRate) : clampedTime
    
    setState(prev => ({ ...prev, currentTime: snappedTime }))
  }, [state.timeline, state.snapToGrid, frameRate])

  const setPlaybackRate = useCallback((rate: number) => {
    setState(prev => ({ ...prev, playbackRate: rate }))
  }, [])

  // Timeline operations
  const loadTimeline = useCallback(async (timelineId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    
    try {
      // In a real app, this would call the timeline service
      // const timeline = await timelineService.getTimeline(timelineId)
      
      // Mock timeline data for now
      const mockTimeline: TimelineData = {
        id: timelineId,
        name: 'Sample Timeline',
        duration: 120,
        tracks: [
          {
            id: 'track-1',
            name: 'Video Track',
            type: 'video',
            clips: [],
            height: 80,
            visible: true,
            locked: false
          }
        ],
        settings: {
          frameRate,
          resolution: { width: 1920, height: 1080 },
          sampleRate: 48000,
          pixelsPerSecond: 20,
          snapToGrid: true,
          gridInterval: 1
        }
      }
      
      setState(prev => ({
        ...prev,
        timeline: mockTimeline,
        isLoading: false,
        isDirty: false
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load timeline',
        isLoading: false
      }))
    }
  }, [frameRate])

  const saveTimeline = useCallback(async () => {
    if (!state.timeline) return
    
    try {
      // In a real app, this would call the timeline service
      // await timelineService.updateTimeline(state.timeline.id, state.timeline)
      
      setState(prev => ({ ...prev, isDirty: false }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to save timeline'
      }))
    }
  }, [state.timeline])

  // Clip operations
  const addClip = useCallback(async (trackId: string, clipData: Omit<TimelineClip, 'id'>) => {
    const newClip: TimelineClip = {
      ...clipData,
      id: Math.random().toString(36).substr(2, 9)
    }

    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.map(track =>
        track.id === trackId
          ? { ...track, clips: [...track.clips, newClip] }
          : track
      )
    }))

    addToHistory({
      type: 'clip_edit',
      data: { action: 'add', trackId, clipId: newClip.id, clipData: newClip }
    })
  }, [updateTimeline, addToHistory])

  const updateClip = useCallback((trackId: string, clipId: string, updates: Partial<TimelineClip>) => {
    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.map(track =>
        track.id === trackId
          ? {
              ...track,
              clips: track.clips.map(clip =>
                clip.id === clipId ? { ...clip, ...updates } : clip
              )
            }
          : track
      )
    }))

    addToHistory({
      type: 'clip_edit',
      data: { action: 'update', trackId, clipId, updates }
    })
  }, [updateTimeline, addToHistory])

  const deleteClip = useCallback((trackId: string, clipId: string) => {
    let deletedClip: TimelineClip | null = null

    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.map(track => {
        if (track.id === trackId) {
          deletedClip = track.clips.find(c => c.id === clipId) || null
          return {
            ...track,
            clips: track.clips.filter(clip => clip.id !== clipId)
          }
        }
        return track
      })
    }))

    setState(prev => ({
      ...prev,
      selectedClips: prev.selectedClips.filter(id => id !== clipId)
    }))

    if (deletedClip) {
      addToHistory({
        type: 'clip_delete',
        data: { trackId, clipId, clipData: deletedClip }
      })
    }
  }, [updateTimeline, addToHistory])

  const splitClip = useCallback((trackId: string, clipId: string, splitTime: number) => {
    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.map(track => {
        if (track.id === trackId) {
          const clipIndex = track.clips.findIndex(c => c.id === clipId)
          const clip = track.clips[clipIndex]
          
          if (!clip || splitTime <= clip.start || splitTime >= clip.end) return track

          const splitOffset = splitTime - clip.start
          const sourceSplitTime = (clip.sourceStart || clip.start) + splitOffset

          const clip1: TimelineClip = {
            ...clip,
            end: splitTime,
            duration: splitOffset,
            sourceEnd: sourceSplitTime
          }

          const clip2: TimelineClip = {
            ...clip,
            id: Math.random().toString(36).substr(2, 9),
            start: splitTime,
            duration: clip.end - splitTime,
            sourceStart: sourceSplitTime,
            label: clip.label ? `${clip.label} (2)` : clip.label
          }

          const newClips = [...track.clips]
          newClips[clipIndex] = clip1
          newClips.splice(clipIndex + 1, 0, clip2)

          return { ...track, clips: newClips }
        }
        return track
      })
    }))

    addToHistory({
      type: 'clip_split',
      data: { trackId, clipId, splitTime }
    })
  }, [updateTimeline, addToHistory])

  const mergeClips = useCallback((trackId: string, clipId1: string, clipId2: string) => {
    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.map(track => {
        if (track.id === trackId) {
          const clip1 = track.clips.find(c => c.id === clipId1)
          const clip2 = track.clips.find(c => c.id === clipId2)
          
          if (!clip1 || !clip2) return track

          // Determine order
          const [firstClip, secondClip] = clip1.start <= clip2.start ? [clip1, clip2] : [clip2, clip1]

          const mergedClip: TimelineClip = {
            ...firstClip,
            end: secondClip.end,
            duration: secondClip.end - firstClip.start,
            sourceEnd: secondClip.sourceEnd || secondClip.end
          }

          return {
            ...track,
            clips: track.clips
              .filter(c => c.id !== clipId1 && c.id !== clipId2)
              .concat(mergedClip)
          }
        }
        return track
      })
    }))

    addToHistory({
      type: 'clip_merge',
      data: { trackId, clipId1, clipId2 }
    })
  }, [updateTimeline, addToHistory])

  const copyClips = useCallback((clipIds: string[]) => {
    if (!state.timeline) return

    const clipsToCopy: { clip: TimelineClip; trackId: string }[] = []
    
    state.timeline.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (clipIds.includes(clip.id)) {
          clipsToCopy.push({ clip, trackId: track.id })
        }
      })
    })

    clipboardRef.current = {
      clips: clipsToCopy.map(({ clip }) => clip),
      trackIds: clipsToCopy.map(({ trackId }) => trackId)
    }
  }, [state.timeline])

  const pasteClips = useCallback((targetTime?: number) => {
    if (!clipboardRef.current || !state.timeline) return

    const pasteTime = targetTime ?? state.currentTime
    
    clipboardRef.current.clips.forEach((clip, index) => {
      const trackId = clipboardRef.current!.trackIds[index]
      const newClip: TimelineClip = {
        ...clip,
        id: Math.random().toString(36).substr(2, 9),
        start: pasteTime,
        end: pasteTime + clip.duration
      }
      
      addClip(trackId, newClip)
    })
  }, [state.timeline, state.currentTime, addClip])

  // Track operations
  const addTrack = useCallback((trackData: Omit<TimelineTrack, 'id' | 'clips'>) => {
    const newTrack: TimelineTrack = {
      ...trackData,
      id: Math.random().toString(36).substr(2, 9),
      clips: []
    }

    updateTimeline(timeline => ({
      ...timeline,
      tracks: [...timeline.tracks, newTrack]
    }))

    addToHistory({
      type: 'track_edit',
      data: { action: 'add', trackData: newTrack }
    })
  }, [updateTimeline, addToHistory])

  const updateTrack = useCallback((trackId: string, updates: Partial<TimelineTrack>) => {
    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.map(track =>
        track.id === trackId ? { ...track, ...updates } : track
      )
    }))

    addToHistory({
      type: 'track_edit',
      data: { action: 'update', trackId, updates }
    })
  }, [updateTimeline, addToHistory])

  const deleteTrack = useCallback((trackId: string) => {
    let deletedTrack: TimelineTrack | null = null

    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.filter(track => {
        if (track.id === trackId) {
          deletedTrack = track
          return false
        }
        return true
      })
    }))

    // Remove clips from selection if track is deleted
    setState(prev => ({
      ...prev,
      selectedClips: prev.selectedClips.filter(clipId => {
        return !deletedTrack?.clips.some(clip => clip.id === clipId)
      })
    }))

    if (deletedTrack) {
      addToHistory({
        type: 'track_edit',
        data: { action: 'delete', trackId, trackData: deletedTrack }
      })
    }
  }, [updateTimeline, addToHistory])

  const toggleTrackProperty = useCallback((trackId: string, property: 'visible' | 'muted' | 'locked') => {
    updateTimeline(timeline => ({
      ...timeline,
      tracks: timeline.tracks.map(track =>
        track.id === trackId
          ? { ...track, [property]: !track[property] }
          : track
      )
    }))

    addToHistory({
      type: 'track_edit',
      data: { action: 'toggle', trackId, property }
    })
  }, [updateTimeline, addToHistory])

  // Selection operations
  const selectClips = useCallback((clipIds: string[]) => {
    setState(prev => ({ ...prev, selectedClips: clipIds }))
  }, [])

  const addToSelection = useCallback((clipId: string) => {
    setState(prev => ({
      ...prev,
      selectedClips: prev.selectedClips.includes(clipId)
        ? prev.selectedClips
        : [...prev.selectedClips, clipId]
    }))
  }, [])

  const removeFromSelection = useCallback((clipId: string) => {
    setState(prev => ({
      ...prev,
      selectedClips: prev.selectedClips.filter(id => id !== clipId)
    }))
  }, [])

  const clearSelection = useCallback(() => {
    setState(prev => ({ ...prev, selectedClips: [] }))
  }, [])

  const selectAll = useCallback(() => {
    if (!state.timeline) return
    
    const allClipIds = state.timeline.tracks.flatMap(track => 
      track.clips.map(clip => clip.id)
    )
    setState(prev => ({ ...prev, selectedClips: allClipIds }))
  }, [state.timeline])

  // Timeline settings
  const setZoom = useCallback((zoom: number) => {
    setState(prev => ({ ...prev, zoomLevel: Math.max(0.1, Math.min(20, zoom)) }))
  }, [])

  const setSnapToGrid = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, snapToGrid: enabled }))
  }, [])

  const setGridInterval = useCallback((interval: number) => {
    setState(prev => ({ ...prev, gridInterval: Math.max(0.1, interval) }))
  }, [])

  // History operations
  const undo = useCallback(() => {
    if (!canUndo) return
    
    // In a full implementation, this would reverse the last action
    setHistoryIndex(prev => prev - 1)
    console.log('Undo operation - would reverse last action')
  }, [canUndo])

  const redo = useCallback(() => {
    if (!canRedo) return
    
    // In a full implementation, this would reapply the next action
    setHistoryIndex(prev => prev + 1)
    console.log('Redo operation - would reapply next action')
  }, [canRedo])

  // Utility functions
  const getClipAt = useCallback((time: number, trackId?: string): TimelineClip | null => {
    if (!state.timeline) return null

    const tracksToSearch = trackId 
      ? state.timeline.tracks.filter(t => t.id === trackId)
      : state.timeline.tracks

    for (const track of tracksToSearch) {
      const clip = findClipAt(track.clips, time)
      if (clip) return clip
    }

    return null
  }, [state.timeline])

  const getSelectedClipsData = useCallback(() => {
    if (!state.timeline) return []

    const result: { clip: TimelineClip; trackId: string }[] = []
    
    state.timeline.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (state.selectedClips.includes(clip.id)) {
          result.push({ clip, trackId: track.id })
        }
      })
    })

    return result
  }, [state.timeline, state.selectedClips])

  const exportData = useCallback(async () => {
    if (!state.timeline) return null

    // In a real implementation, this would call the timeline service
    return {
      timeline: state.timeline,
      renderInstructions: [] // Would generate actual render instructions
    }
  }, [state.timeline])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
      }
    }
  }, [])

  return {
    ...state,
    
    // Playback controls
    play,
    pause,
    togglePlayPause,
    seek,
    setPlaybackRate,
    
    // Timeline operations
    loadTimeline,
    saveTimeline,
    
    // Clip operations
    addClip,
    updateClip,
    deleteClip,
    splitClip,
    mergeClips,
    copyClips,
    pasteClips,
    
    // Track operations
    addTrack,
    updateTrack,
    deleteTrack,
    toggleTrackProperty,
    
    // Selection
    selectClips,
    addToSelection,
    removeFromSelection,
    clearSelection,
    selectAll,
    
    // Timeline settings
    setZoom,
    setSnapToGrid,
    setGridInterval,
    
    // History
    undo,
    redo,
    canUndo,
    canRedo,
    
    // Utilities
    getClipAt,
    getSelectedClipsData,
    exportData
  }
}