'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { TimelineOperations, TimelineState, createTimelineOperations } from '@/lib/timeline/operations'
import { SegmentCutter } from '@/lib/timeline/segment-operations'

interface UseTimelineOptions {
  mediaFileId: string
  transcript?: any
  autoSave?: boolean
  autoSaveDelay?: number
  onSave?: (success: boolean) => void
  onError?: (error: string) => void
}

interface UseTimelineReturn {
  // State
  state: TimelineState | null
  isLoading: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  error: string | null
  
  // Operations
  operations: TimelineOperations | null
  
  // Basic timeline operations
  setCurrentTime: (time: number) => void
  save: () => Promise<void>
  
  // Clip operations
  editClip: (trackId: string, clipId: string, updates: any) => void
  deleteClip: (trackId: string, clipId: string) => void
  splitClip: (trackId: string, clipId: string, splitTime: number) => void
  mergeClips: (trackId: string, clipId1: string, clipId2: string) => void
  copyClip: (trackId: string, clipId: string) => void
  pasteClip: (trackId: string, time: number) => void
  
  // Track operations
  toggleTrack: (trackId: string, property: 'visible' | 'muted' | 'locked') => void
  
  // Advanced operations
  cutSegmentAtTime: (trackId: string, clipId: string, cutTime: number) => boolean
  trimSegment: (trackId: string, clipId: string, newStart?: number, newEnd?: number) => boolean
  duplicateSegment: (trackId: string, clipId: string, insertTime: number) => boolean
  extractSegment: (trackId: string, clipId: string, extractStart: number, extractEnd: number) => boolean
  
  // History operations
  undo: () => boolean
  redo: () => boolean
  canUndo: boolean
  canRedo: boolean
  
  // Analysis
  getStatistics: () => any
  detectIssues: () => any[]
  
  // Utility
  snapToGrid: (time: number) => number
  findNearestClipEdge: (time: number) => { time: number; clipId: string; edge: 'start' | 'end' } | null
}

export const useTimeline = (options: UseTimelineOptions): UseTimelineReturn => {
  const [state, setState] = useState<TimelineState | null>(null)
  const [operations, setOperations] = useState<TimelineOperations | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()
  const lastSaveTimeRef = useRef<number>(0)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  
  // Initialize timeline operations
  useEffect(() => {
    const initializeTimeline = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        const timelineOps = createTimelineOperations()
        await timelineOps.initializeFromMedia(options.mediaFileId, options.transcript)
        
        // Subscribe to state changes
        const unsubscribe = timelineOps.subscribe((newState) => {
          setState(newState)
          setHasUnsavedChanges(true)
          
          // Auto-save if enabled
          if (options.autoSave !== false) {
            if (autoSaveTimeoutRef.current) {
              clearTimeout(autoSaveTimeoutRef.current)
            }
            
            autoSaveTimeoutRef.current = setTimeout(() => {
              handleAutoSave(timelineOps)
            }, options.autoSaveDelay || 2000)
          }
        })
        
        unsubscribeRef.current = unsubscribe
        setOperations(timelineOps)
        setState(timelineOps.getState())
        setIsLoading(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize timeline'
        setError(errorMessage)
        options.onError?.(errorMessage)
        setIsLoading(false)
      }
    }
    
    initializeTimeline()
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
    }
  }, [options.mediaFileId, options.transcript])
  
  // Auto-save handler
  const handleAutoSave = useCallback(async (ops: TimelineOperations) => {
    const now = Date.now()
    if (now - lastSaveTimeRef.current < 1000) return // Debounce
    
    lastSaveTimeRef.current = now
    
    try {
      await ops.saveTimeline()
      setHasUnsavedChanges(false)
      options.onSave?.(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Auto-save failed'
      setError(errorMessage)
      options.onError?.(errorMessage)
    }
  }, [options.onSave, options.onError])
  
  // Manual save
  const save = useCallback(async () => {
    if (!operations || isSaving) return
    
    setIsSaving(true)
    try {
      await operations.saveTimeline()
      setHasUnsavedChanges(false)
      options.onSave?.(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Save failed'
      setError(errorMessage)
      options.onError?.(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }, [operations, isSaving, options.onSave, options.onError])
  
  // Basic operations
  const setCurrentTime = useCallback((time: number) => {
    operations?.setCurrentTime(time)
  }, [operations])
  
  // Clip operations
  const editClip = useCallback((trackId: string, clipId: string, updates: any) => {
    operations?.editClip(trackId, clipId, updates)
  }, [operations])
  
  const deleteClip = useCallback((trackId: string, clipId: string) => {
    operations?.deleteClip(trackId, clipId)
  }, [operations])
  
  const splitClip = useCallback((trackId: string, clipId: string, splitTime: number) => {
    operations?.splitClip(trackId, clipId, splitTime)
  }, [operations])
  
  const mergeClips = useCallback((trackId: string, clipId1: string, clipId2: string) => {
    operations?.mergeClips(trackId, clipId1, clipId2)
  }, [operations])
  
  const copyClip = useCallback((trackId: string, clipId: string) => {
    operations?.copyClip(trackId, clipId)
  }, [operations])
  
  const pasteClip = useCallback((trackId: string, time: number) => {
    operations?.pasteClip(trackId, time)
  }, [operations])
  
  // Track operations
  const toggleTrack = useCallback((trackId: string, property: 'visible' | 'muted' | 'locked') => {
    operations?.toggleTrack(trackId, property)
  }, [operations])
  
  // Advanced clip operations using SegmentCutter
  const cutSegmentAtTime = useCallback((trackId: string, clipId: string, cutTime: number): boolean => {
    if (!state) return false
    
    const track = state.tracks.find(t => t.id === trackId)
    if (!track) return false
    
    const result = SegmentCutter.cutSegmentAtTime(track, clipId, cutTime)
    if (result.success && result.newClips) {
      // Update the track with new clips
      const clipIndex = track.clips.findIndex(c => c.id === clipId)
      if (clipIndex !== -1) {
        track.clips.splice(clipIndex, 1, ...result.newClips)
        // operations?.notify?.() - This will be handled by the operations class
      }
    } else if (result.error) {
      setError(result.error)
      options.onError?.(result.error)
    }
    
    return result.success
  }, [state, operations, options.onError])
  
  const trimSegment = useCallback((trackId: string, clipId: string, newStart?: number, newEnd?: number): boolean => {
    if (!state) return false
    
    const track = state.tracks.find(t => t.id === trackId)
    const clip = track?.clips.find(c => c.id === clipId)
    if (!track || !clip) return false
    
    const result = SegmentCutter.trimSegment(clip, newStart, newEnd)
    if (result.success && result.trimmedClip) {
      operations?.editClip(trackId, clipId, result.trimmedClip)
    } else if (result.error) {
      setError(result.error)
      options.onError?.(result.error)
    }
    
    return result.success
  }, [state, operations, options.onError])
  
  const duplicateSegment = useCallback((trackId: string, clipId: string, insertTime: number): boolean => {
    if (!state) return false
    
    const track = state.tracks.find(t => t.id === trackId)
    const clip = track?.clips.find(c => c.id === clipId)
    if (!track || !clip) return false
    
    const result = SegmentCutter.duplicateSegment(clip, insertTime)
    if (result.success && result.duplicatedClip) {
      track.clips.push(result.duplicatedClip)
      track.clips.sort((a, b) => a.start - b.start)
      operations?.notify?.()
    } else if (result.error) {
      setError(result.error)
      options.onError?.(result.error)
    }
    
    return result.success
  }, [state, operations, options.onError])
  
  const extractSegment = useCallback((
    trackId: string, 
    clipId: string, 
    extractStart: number, 
    extractEnd: number
  ): boolean => {
    if (!state) return false
    
    const track = state.tracks.find(t => t.id === trackId)
    const clip = track?.clips.find(c => c.id === clipId)
    if (!track || !clip) return false
    
    const result = SegmentCutter.extractSegment(clip, extractStart, extractEnd)
    if (result.success) {
      // Remove original clip
      const clipIndex = track.clips.findIndex(c => c.id === clipId)
      if (clipIndex !== -1) {
        track.clips.splice(clipIndex, 1)
        
        // Add remaining clips
        if (result.remainingClips) {
          track.clips.push(...result.remainingClips)
        }
        
        // Sort clips by start time
        track.clips.sort((a, b) => a.start - b.start)
        // operations?.notify?.() - This will be handled by the operations class
        
        // Store extracted clip in clipboard for pasting
        if (result.extractedClip) {
          sessionStorage.setItem('timeline_clipboard', JSON.stringify({
            clip: result.extractedClip,
            trackId
          }))
        }
      }
    } else if (result.error) {
      setError(result.error)
      options.onError?.(result.error)
    }
    
    return result.success
  }, [state, operations, options.onError])
  
  // History operations
  const undo = useCallback((): boolean => {
    return operations?.undo() || false
  }, [operations])
  
  const redo = useCallback((): boolean => {
    return operations?.redo() || false
  }, [operations])
  
  // Analysis functions
  const getStatistics = useCallback(() => {
    return operations?.getStatistics()
  }, [operations])
  
  const detectIssues = useCallback(() => {
    if (!state) return []
    
    const issues: any[] = []
    
    state.tracks.forEach((track, trackIndex) => {
      // Detect overlaps
      const overlaps = SegmentCutter.detectOverlaps(track)
      overlaps.forEach(overlap => {
        issues.push({
          type: 'overlap',
          severity: 'error',
          trackIndex,
          message: `Clips overlap by ${overlap.overlapDuration.toFixed(2)}s`,
          clips: [overlap.clip1.id, overlap.clip2.id]
        })
      })
      
      // Detect gaps
      const gaps = SegmentCutter.detectGaps(track, 0.5) // Gaps > 0.5s
      gaps.forEach(gap => {
        issues.push({
          type: 'gap',
          severity: 'warning',
          trackIndex,
          message: `Gap of ${gap.duration.toFixed(2)}s detected`,
          timeRange: [gap.start, gap.end]
        })
      })
      
      // Detect very short clips
      track.clips.forEach(clip => {
        if (clip.duration < 0.5) {
          issues.push({
            type: 'short_clip',
            severity: 'warning',
            trackIndex,
            clipId: clip.id,
            message: `Very short clip: ${clip.duration.toFixed(2)}s`
          })
        }
      })
    })
    
    return issues
  }, [state])
  
  // Utility functions
  const snapToGrid = useCallback((time: number) => {
    return SegmentCutter.snapToGrid(time, 1, 30) // 1 second grid, 30fps
  }, [])
  
  const findNearestClipEdge = useCallback((time: number) => {
    if (!state) return null
    return SegmentCutter.findNearestClipEdge(state.tracks, time)
  }, [state])
  
  const canUndo = state ? state.historyIndex >= 0 : false
  const canRedo = state ? state.historyIndex < state.history.length - 1 : false
  
  return {
    // State
    state,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    error,
    
    // Operations
    operations,
    
    // Basic operations
    setCurrentTime,
    save,
    
    // Clip operations
    editClip,
    deleteClip,
    splitClip,
    mergeClips,
    copyClip,
    pasteClip,
    
    // Track operations
    toggleTrack,
    
    // Advanced operations
    cutSegmentAtTime,
    trimSegment,
    duplicateSegment,
    extractSegment,
    
    // History operations
    undo,
    redo,
    canUndo,
    canRedo,
    
    // Analysis
    getStatistics,
    detectIssues,
    
    // Utility
    snapToGrid,
    findNearestClipEdge
  }
}

export default useTimeline
