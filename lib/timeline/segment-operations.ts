'use client'

import { TimelineClip, TimelineTrack } from './operations'
import { generateId } from '@/lib/utils'

// Advanced segment cutting operations
export class SegmentCutter {
  static cutSegmentAtTime(
    track: TimelineTrack,
    clipId: string,
    cutTime: number
  ): { success: boolean; newClips?: TimelineClip[]; error?: string } {
    const clip = track.clips.find(c => c.id === clipId)
    if (!clip) {
      return { success: false, error: 'Clip not found' }
    }

    if (cutTime <= clip.start || cutTime >= clip.end) {
      return { success: false, error: 'Cut time is outside clip bounds' }
    }

    if (clip.locked) {
      return { success: false, error: 'Clip is locked' }
    }

    // Create the second part of the cut
    const secondPart: TimelineClip = {
      ...clip,
      id: generateId(),
      start: cutTime,
      duration: clip.end - cutTime,
      sourceStart: clip.sourceStart ? clip.sourceStart + (cutTime - clip.start) : cutTime,
      effects: clip.effects?.map(effect => ({ ...effect, id: generateId() })) || []
    }

    // Update the first part
    const firstPart: TimelineClip = {
      ...clip,
      end: cutTime,
      duration: cutTime - clip.start,
      sourceEnd: clip.sourceStart ? clip.sourceStart + (cutTime - clip.start) : cutTime
    }

    return { success: true, newClips: [firstPart, secondPart] }
  }

  static trimSegment(
    clip: TimelineClip,
    newStart?: number,
    newEnd?: number
  ): { success: boolean; trimmedClip?: TimelineClip; error?: string } {
    if (clip.locked) {
      return { success: false, error: 'Clip is locked' }
    }

    const start = newStart ?? clip.start
    const end = newEnd ?? clip.end

    if (start >= end) {
      return { success: false, error: 'Start time must be before end time' }
    }

    if (end - start < 0.1) {
      return { success: false, error: 'Clip duration must be at least 0.1 seconds' }
    }

    const trimmedClip: TimelineClip = {
      ...clip,
      start,
      end,
      duration: end - start
    }

    // Update source timing if available
    if (clip.sourceStart !== undefined) {
      const sourceOffset = start - clip.start
      trimmedClip.sourceStart = clip.sourceStart + sourceOffset
      trimmedClip.sourceEnd = trimmedClip.sourceStart + trimmedClip.duration
    }

    return { success: true, trimmedClip }
  }

  static mergeAdjacentSegments(
    clip1: TimelineClip,
    clip2: TimelineClip
  ): { success: boolean; mergedClip?: TimelineClip; error?: string } {
    if (clip1.locked || clip2.locked) {
      return { success: false, error: 'One or both clips are locked' }
    }

    if (clip1.type !== clip2.type) {
      return { success: false, error: 'Clips must be of the same type to merge' }
    }

    // Determine order
    const [first, second] = clip1.start < clip2.start ? [clip1, clip2] : [clip2, clip1]

    // Check if clips are adjacent (within 0.1 second tolerance)
    const gap = second.start - first.end
    if (Math.abs(gap) > 0.1) {
      return { success: false, error: 'Clips must be adjacent to merge' }
    }

    const mergedClip: TimelineClip = {
      ...first,
      id: generateId(),
      end: second.end,
      duration: second.end - first.start,
      sourceEnd: second.sourceEnd || second.end
    }

    // Merge text data for text clips
    if (first.type === 'text' && first.data && second.data) {
      mergedClip.data = {
        ...first.data,
        text: `${first.data.text} ${second.data.text}`.trim()
      }
      
      // Update label
      const text = mergedClip.data.text
      mergedClip.label = text.length > 50 ? text.substring(0, 50) + '...' : text
    }

    // Combine effects from both clips
    const combinedEffects = [...(first.effects || []), ...(second.effects || [])]
      .map(effect => ({ ...effect, id: generateId() }))
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
    
    mergedClip.effects = combinedEffects

    return { success: true, mergedClip }
  }

  static duplicateSegment(
    clip: TimelineClip,
    insertTime: number
  ): { success: boolean; duplicatedClip?: TimelineClip; error?: string } {
    const duplicatedClip: TimelineClip = {
      ...clip,
      id: generateId(),
      start: insertTime,
      end: insertTime + clip.duration,
      effects: clip.effects?.map(effect => ({ ...effect, id: generateId() })) || []
    }

    return { success: true, duplicatedClip }
  }

  static extractSegment(
    clip: TimelineClip,
    extractStart: number,
    extractEnd: number
  ): { success: boolean; extractedClip?: TimelineClip; remainingClips?: TimelineClip[]; error?: string } {
    if (clip.locked) {
      return { success: false, error: 'Clip is locked' }
    }

    if (extractStart < clip.start || extractEnd > clip.end || extractStart >= extractEnd) {
      return { success: false, error: 'Invalid extraction range' }
    }

    const extractedClip: TimelineClip = {
      ...clip,
      id: generateId(),
      start: extractStart,
      end: extractEnd,
      duration: extractEnd - extractStart
    }

    // Update source timing
    if (clip.sourceStart !== undefined) {
      const sourceOffset = extractStart - clip.start
      extractedClip.sourceStart = clip.sourceStart + sourceOffset
      extractedClip.sourceEnd = extractedClip.sourceStart + extractedClip.duration
    }

    const remainingClips: TimelineClip[] = []

    // Create clip before extraction if needed
    if (extractStart > clip.start) {
      remainingClips.push({
        ...clip,
        id: generateId(),
        end: extractStart,
        duration: extractStart - clip.start,
        sourceEnd: clip.sourceStart ? clip.sourceStart + (extractStart - clip.start) : extractStart
      })
    }

    // Create clip after extraction if needed
    if (extractEnd < clip.end) {
      remainingClips.push({
        ...clip,
        id: generateId(),
        start: extractEnd,
        duration: clip.end - extractEnd,
        sourceStart: clip.sourceStart ? clip.sourceStart + (extractEnd - clip.start) : extractEnd
      })
    }

    return { success: true, extractedClip, remainingClips }
  }

  static snapToGrid(
    time: number,
    gridInterval: number = 1,
    frameRate?: number
  ): number {
    let snappedTime = Math.round(time / gridInterval) * gridInterval
    
    // Frame-accurate snapping if frame rate is provided
    if (frameRate && frameRate > 0) {
      const frameTime = 1 / frameRate
      snappedTime = Math.round(snappedTime / frameTime) * frameTime
    }
    
    return snappedTime
  }

  static findNearestClipEdge(
    tracks: TimelineTrack[],
    targetTime: number,
    tolerance: number = 0.5
  ): { time: number; clipId: string; edge: 'start' | 'end' } | null {
    let nearestEdge = null
    let minDistance = tolerance

    tracks.forEach(track => {
      track.clips.forEach(clip => {
        // Check start edge
        const startDistance = Math.abs(clip.start - targetTime)
        if (startDistance < minDistance) {
          minDistance = startDistance
          nearestEdge = { time: clip.start, clipId: clip.id, edge: 'start' as const }
        }

        // Check end edge
        const endDistance = Math.abs(clip.end - targetTime)
        if (endDistance < minDistance) {
          minDistance = endDistance
          nearestEdge = { time: clip.end, clipId: clip.id, edge: 'end' as const }
        }
      })
    })

    return nearestEdge
  }

  static detectGaps(
    track: TimelineTrack,
    minGapDuration: number = 0.1
  ): Array<{ start: number; end: number; duration: number }> {
    const gaps: Array<{ start: number; end: number; duration: number }> = []
    const sortedClips = [...track.clips].sort((a, b) => a.start - b.start)

    for (let i = 0; i < sortedClips.length - 1; i++) {
      const currentClip = sortedClips[i]
      const nextClip = sortedClips[i + 1]
      
      const gapStart = currentClip.end
      const gapEnd = nextClip.start
      const gapDuration = gapEnd - gapStart

      if (gapDuration >= minGapDuration) {
        gaps.push({ start: gapStart, end: gapEnd, duration: gapDuration })
      }
    }

    return gaps
  }

  static detectOverlaps(
    track: TimelineTrack
  ): Array<{ clip1: TimelineClip; clip2: TimelineClip; overlapStart: number; overlapEnd: number; overlapDuration: number }> {
    const overlaps: Array<{
      clip1: TimelineClip
      clip2: TimelineClip
      overlapStart: number
      overlapEnd: number
      overlapDuration: number
    }> = []

    for (let i = 0; i < track.clips.length; i++) {
      for (let j = i + 1; j < track.clips.length; j++) {
        const clip1 = track.clips[i]
        const clip2 = track.clips[j]

        const overlapStart = Math.max(clip1.start, clip2.start)
        const overlapEnd = Math.min(clip1.end, clip2.end)

        if (overlapStart < overlapEnd) {
          overlaps.push({
            clip1,
            clip2,
            overlapStart,
            overlapEnd,
            overlapDuration: overlapEnd - overlapStart
          })
        }
      }
    }

    return overlaps
  }

  static optimizeTrackLayout(
    track: TimelineTrack,
    removeGaps: boolean = false,
    minGapDuration: number = 0.1
  ): TimelineClip[] {
    let optimizedClips = [...track.clips].sort((a, b) => a.start - b.start)

    if (removeGaps) {
      let currentTime = 0
      
      optimizedClips = optimizedClips.map(clip => {
        const optimizedClip = {
          ...clip,
          start: currentTime,
          end: currentTime + clip.duration
        }
        
        currentTime += clip.duration + minGapDuration
        return optimizedClip
      })
    }

    return optimizedClips
  }

  static analyzeTrackStatistics(
    track: TimelineTrack
  ): {
    totalDuration: number
    clipCount: number
    averageClipDuration: number
    longestClip: { duration: number; clip: TimelineClip }
    shortestClip: { duration: number; clip: TimelineClip }
    gaps: Array<{ start: number; end: number; duration: number }>
    overlaps: Array<{ clip1: TimelineClip; clip2: TimelineClip; overlapDuration: number }>
    coverage: number // Percentage of timeline covered by clips
  } {
    if (track.clips.length === 0) {
      return {
        totalDuration: 0,
        clipCount: 0,
        averageClipDuration: 0,
        longestClip: { duration: 0, clip: {} as TimelineClip },
        shortestClip: { duration: 0, clip: {} as TimelineClip },
        gaps: [],
        overlaps: [],
        coverage: 0
      }
    }

    const totalDuration = track.clips.reduce((sum, clip) => sum + clip.duration, 0)
    const clipCount = track.clips.length
    const averageClipDuration = totalDuration / clipCount
    
    const sortedByDuration = [...track.clips].sort((a, b) => b.duration - a.duration)
    const longestClip = { duration: sortedByDuration[0].duration, clip: sortedByDuration[0] }
    const shortestClip = { duration: sortedByDuration[clipCount - 1].duration, clip: sortedByDuration[clipCount - 1] }
    
    const gaps = this.detectGaps(track)
    const overlaps = this.detectOverlaps(track).map(({ clip1, clip2, overlapDuration }) => ({
      clip1, clip2, overlapDuration
    }))
    
    // Calculate coverage
    const trackStart = Math.min(...track.clips.map(c => c.start))
    const trackEnd = Math.max(...track.clips.map(c => c.end))
    const trackSpan = trackEnd - trackStart
    const coverage = trackSpan > 0 ? (totalDuration / trackSpan) * 100 : 0

    return {
      totalDuration,
      clipCount,
      averageClipDuration,
      longestClip,
      shortestClip,
      gaps,
      overlaps,
      coverage
    }
  }
}

// Export utility functions for easy use
export const cutSegment = SegmentCutter.cutSegmentAtTime
export const trimSegment = SegmentCutter.trimSegment
export const mergeSegments = SegmentCutter.mergeAdjacentSegments
export const duplicateSegment = SegmentCutter.duplicateSegment
export const extractSegment = SegmentCutter.extractSegment
export const snapToGrid = SegmentCutter.snapToGrid
export const findNearestClipEdge = SegmentCutter.findNearestClipEdge
export const detectGaps = SegmentCutter.detectGaps
export const detectOverlaps = SegmentCutter.detectOverlaps
export const optimizeTrackLayout = SegmentCutter.optimizeTrackLayout
export const analyzeTrackStatistics = SegmentCutter.analyzeTrackStatistics
