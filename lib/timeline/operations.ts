'use client'

import { generateId } from '@/lib/utils'

// Timeline data types matching the existing TimelineEditor component
export interface TimelineClip {
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

export interface TimelineEffect {
  id: string
  type: 'fade' | 'transition' | 'filter'
  name: string
  parameters: Record<string, any>
  startTime?: number
  endTime?: number
  enabled: boolean
}

export interface TimelineTrack {
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

export interface TimelineAction {
  id: string
  type: 'clip_edit' | 'clip_delete' | 'clip_split' | 'clip_merge' | 'track_edit'
  data: any
  timestamp: number
}

export interface TimelineState {
  tracks: TimelineTrack[]
  duration: number
  currentTime: number
  zoom: number
  history: TimelineAction[]
  historyIndex: number
}

// Timeline operations class for managing state and persistence
export class TimelineOperations {
  private state: TimelineState
  private listeners: Set<(state: TimelineState) => void> = new Set()
  private mediaFileId?: string
  private timelineId?: string

  constructor(initialState?: Partial<TimelineState>) {
    this.state = {
      tracks: [],
      duration: 0,
      currentTime: 0,
      zoom: 1,
      history: [],
      historyIndex: -1,
      ...initialState
    }
  }

  // Subscribe to state changes
  subscribe(listener: (state: TimelineState) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Notify listeners of state changes
  private notify() {
    this.listeners.forEach(listener => listener({ ...this.state }))
  }

  // Get current state
  getState(): TimelineState {
    return { ...this.state }
  }

  // Initialize timeline from media file and transcript
  async initializeFromMedia(mediaFileId: string, transcript?: any, mediaDuration?: number): Promise<void> {
    this.mediaFileId = mediaFileId
    
    try {
      // Try to load existing timeline from database
      const existingTimeline = await this.loadTimelineFromDB(mediaFileId)
      
      if (existingTimeline) {
        this.state = existingTimeline
        this.timelineId = existingTimeline.id
      } else {
        // Create new timeline from transcript or media file
        await this.createTimelineFromTranscript(mediaFileId, transcript, mediaDuration)
      }
      
      this.notify()
    } catch (error) {
      console.error('Failed to initialize timeline:', error)
      // Create basic timeline structure anyway
      this.createBasicTimeline(mediaFileId, transcript, mediaDuration)
      this.notify()
    }
  }

  // Load existing timeline from database
  private async loadTimelineFromDB(mediaFileId: string): Promise<TimelineState | null> {
    try {
      const response = await fetch(`/api/timeline?mediaFileId=${mediaFileId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.timeline) {
          return this.dbTimelineToState(data.timeline)
        }
      }
    } catch (error) {
      console.error('Failed to load timeline from database:', error)
    }
    return null
  }

  // Convert database timeline to state format
  private dbTimelineToState(dbTimeline: any): TimelineState {
    const tracks: TimelineTrack[] = dbTimeline.tracks.map((track: any) => ({
      id: track.id,
      name: track.name,
      type: track.type as 'video' | 'audio' | 'text' | 'overlay',
      clips: track.clips.map((clip: any) => ({
        id: clip.id,
        start: clip.timelineStart,
        end: clip.timelineStart + clip.duration,
        duration: clip.duration,
        type: track.type,
        label: clip.name || `${track.type} clip`,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
        volume: clip.volume,
        opacity: clip.opacity,
        locked: clip.locked,
        effects: clip.effects?.map((effect: any) => ({
          id: effect.id,
          type: effect.type,
          name: effect.name,
          parameters: JSON.parse(effect.parameters || '{}'),
          startTime: effect.startTime,
          endTime: effect.endTime,
          enabled: effect.enabled
        })) || []
      })),
      height: 80,
      visible: track.enabled,
      muted: false,
      locked: track.locked,
      volume: track.volume,
      opacity: track.opacity
    }))

    return {
      tracks,
      duration: dbTimeline.duration,
      currentTime: 0,
      zoom: 1,
      history: [],
      historyIndex: -1
    }
  }

  // Create timeline from transcript segments
  private async createTimelineFromTranscript(mediaFileId: string, transcript?: any, mediaDuration?: number): Promise<void> {
    const tracks: TimelineTrack[] = []
    let duration = mediaDuration || 0

    if (transcript && transcript.segments && transcript.segments.length > 0) {
      // Create text track from transcript segments
      const textTrack: TimelineTrack = {
        id: generateId(),
        name: 'Transcript',
        type: 'text',
        clips: transcript.segments.map((segment: any) => ({
          id: generateId(),
          start: segment.start,
          end: segment.end,
          duration: segment.end - segment.start,
          type: 'text' as const,
          label: segment.text.length > 30 ? segment.text.substring(0, 30) + '...' : segment.text,
          data: {
            text: segment.text,
            speaker: segment.speaker,
            confidence: segment.confidence
          },
          sourceStart: segment.start,
          sourceEnd: segment.end,
          volume: 1,
          opacity: 1,
          locked: false,
          effects: []
        })),
        height: 80,
        visible: true,
        locked: false,
        volume: 1,
        opacity: 1,
        color: 'yellow'
      }
      
      tracks.push(textTrack)
      // Keep the duration from mediaDuration if provided, otherwise use transcript duration
      if (!mediaDuration) {
        duration = Math.max(duration, Math.max(...transcript.segments.map((s: any) => s.end)))
      }
    }

    // If no duration provided and no transcript, use default
    if (duration === 0) {
      duration = 60
    }

    // Create audio/video track placeholder with full media duration
    const mediaTrack: TimelineTrack = {
      id: generateId(),
      name: 'Media',
      type: 'video', // Will be determined by media type
      clips: [
        {
          id: generateId(),
          start: 0,
          end: duration,
          duration: duration,
          type: 'video',
          label: 'Media clip',
          sourceStart: 0,
          sourceEnd: duration,
          volume: 1,
          opacity: 1,
          locked: false,
          effects: []
        }
      ],
      height: 120,
      visible: true,
      locked: false,
      volume: 1,
      opacity: 1,
      color: 'blue'
    }
    
    tracks.unshift(mediaTrack) // Add media track first

    this.state = {
      tracks,
      duration: duration,
      currentTime: 0,
      zoom: 1,
      history: [],
      historyIndex: -1
    }

    // Save to database
    await this.saveTimeline()
  }

  // Create basic timeline structure without transcript
  private createBasicTimeline(mediaFileId: string, transcript?: any, mediaDuration?: number): void {
    const duration = mediaDuration || 60
    const tracks: TimelineTrack[] = [
      {
        id: generateId(),
        name: 'Media',
        type: 'video',
        clips: [
          {
            id: generateId(),
            start: 0,
            end: duration,
            duration: duration,
            type: 'video',
            label: 'Media clip',
            sourceStart: 0,
            sourceEnd: duration,
            volume: 1,
            opacity: 1,
            locked: false,
            effects: []
          }
        ],
        height: 120,
        visible: true,
        locked: false,
        volume: 1,
        opacity: 1,
        color: 'blue'
      }
    ]

    this.state = {
      tracks,
      duration: duration,
      currentTime: 0,
      zoom: 1,
      history: [],
      historyIndex: -1
    }
  }

  // Save timeline to database
  async saveTimeline(): Promise<void> {
    if (!this.mediaFileId) return

    try {
      const timelineData = {
        mediaFileId: this.mediaFileId,
        name: `Timeline for media ${this.mediaFileId}`,
        settings: JSON.stringify({
          zoom: this.state.zoom,
          snapToGrid: true,
          gridInterval: 1
        }),
        duration: this.state.duration,
        tracks: this.state.tracks.map(track => ({
          id: track.id,
          name: track.name,
          type: track.type,
          enabled: track.visible,
          locked: track.locked,
          volume: track.volume,
          opacity: track.opacity,
          clips: track.clips.map(clip => ({
            id: clip.id,
            name: clip.label,
            sourceStart: clip.sourceStart || clip.start,
            sourceEnd: clip.sourceEnd || clip.end,
            timelineStart: clip.start,
            duration: clip.duration,
            enabled: true,
            locked: clip.locked,
            volume: clip.volume,
            opacity: clip.opacity,
            effects: clip.effects?.map(effect => ({
              id: effect.id,
              type: effect.type,
              name: effect.name,
              parameters: JSON.stringify(effect.parameters),
              startTime: effect.startTime,
              endTime: effect.endTime,
              enabled: effect.enabled
            })) || []
          }))
        }))
      }

      const response = await fetch('/api/timeline', {
        method: this.timelineId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...timelineData, 
          id: this.timelineId 
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (!this.timelineId) {
          this.timelineId = result.timeline.id
        }
      }
    } catch (error) {
      console.error('Failed to save timeline:', error)
    }
  }

  // Add action to history for undo/redo
  private addToHistory(action: Omit<TimelineAction, 'id' | 'timestamp'>) {
    const newAction: TimelineAction = {
      id: generateId(),
      timestamp: Date.now(),
      ...action
    }

    // Remove any future history if we're not at the end
    const newHistory = this.state.history.slice(0, this.state.historyIndex + 1)
    newHistory.push(newAction)

    this.state.history = newHistory.slice(-50) // Keep last 50 actions
    this.state.historyIndex = Math.min(this.state.historyIndex + 1, 49)
  }

  // Edit clip properties
  editClip(trackId: string, clipId: string, updates: Partial<TimelineClip>): void {
    const track = this.state.tracks.find(t => t.id === trackId)
    const clip = track?.clips.find(c => c.id === clipId)
    
    if (!track || !clip || track.locked || clip.locked) return

    const originalClip = { ...clip }
    Object.assign(clip, updates)

    this.addToHistory({
      type: 'clip_edit',
      data: { trackId, clipId, originalClip, updates }
    })

    this.notify()
    this.saveTimeline() // Auto-save
  }

  // Delete clip
  deleteClip(trackId: string, clipId: string): void {
    const track = this.state.tracks.find(t => t.id === trackId)
    if (!track || track.locked) return

    const clipIndex = track.clips.findIndex(c => c.id === clipId)
    const clip = track.clips[clipIndex]
    
    if (clipIndex === -1 || clip.locked) return

    track.clips.splice(clipIndex, 1)

    this.addToHistory({
      type: 'clip_delete',
      data: { trackId, clipId, clip, clipIndex }
    })

    this.notify()
    this.saveTimeline()
  }

  // Split clip at specified time
  splitClip(trackId: string, clipId: string, splitTime: number): void {
    const trackIndex = this.state.tracks.findIndex(t => t.id === trackId)
    if (trackIndex === -1) return
    
    const track = this.state.tracks[trackIndex]
    const clipIndex = track.clips.findIndex(c => c.id === clipId)
    if (clipIndex === -1) return
    
    const clip = track.clips[clipIndex]
    if (track.locked || clip.locked) return
    if (splitTime <= clip.start || splitTime >= clip.end) return

    console.log('Splitting clip:', { clipId, splitTime, clipStart: clip.start, clipEnd: clip.end })

    // Create new clips for both halves
    const firstHalf: TimelineClip = {
      ...clip,
      end: splitTime,
      duration: splitTime - clip.start,
      sourceEnd: clip.sourceStart ? clip.sourceStart + (splitTime - clip.start) : splitTime
    }

    const secondHalf: TimelineClip = {
      ...clip,
      id: generateId(),
      start: splitTime,
      end: clip.end,
      duration: clip.end - splitTime,
      sourceStart: clip.sourceStart ? clip.sourceStart + (splitTime - clip.start) : splitTime,
      sourceEnd: clip.sourceEnd
    }

    // Replace the original clip with the two new halves
    const newClips = [...track.clips]
    newClips.splice(clipIndex, 1, firstHalf, secondHalf)
    
    // Update the track with new clips array
    const newTracks = [...this.state.tracks]
    newTracks[trackIndex] = {
      ...track,
      clips: newClips
    }
    
    this.state.tracks = newTracks

    this.addToHistory({
      type: 'clip_split',
      data: { trackId, clipId, splitTime, newClipId: secondHalf.id, originalClip: clip }
    })

    this.notify()
    this.saveTimeline()
  }

  // Merge adjacent clips
  mergeClips(trackId: string, clipId1: string, clipId2: string): void {
    const track = this.state.tracks.find(t => t.id === trackId)
    if (!track || track.locked) return

    const clip1 = track.clips.find(c => c.id === clipId1)
    const clip2 = track.clips.find(c => c.id === clipId2)
    
    if (!clip1 || !clip2 || clip1.locked || clip2.locked) return
    if (clip1.type !== clip2.type) return // Can only merge same type clips

    // Ensure clip1 comes before clip2
    const [firstClip, secondClip] = clip1.start < clip2.start ? [clip1, clip2] : [clip2, clip1]
    
    if (Math.abs(firstClip.end - secondClip.start) > 0.1) return // Must be adjacent

    // Merge clips
    firstClip.end = secondClip.end
    firstClip.duration = firstClip.end - firstClip.start
    if (firstClip.sourceEnd && secondClip.sourceEnd) {
      firstClip.sourceEnd = secondClip.sourceEnd
    }

    // Handle text data merging
    if (firstClip.type === 'text' && firstClip.data && secondClip.data) {
      firstClip.data.text = firstClip.data.text + ' ' + secondClip.data.text
      firstClip.label = firstClip.data.text.length > 30 ? 
        firstClip.data.text.substring(0, 30) + '...' : firstClip.data.text
    }

    // Remove second clip
    const clip2Index = track.clips.findIndex(c => c.id === secondClip.id)
    track.clips.splice(clip2Index, 1)

    this.addToHistory({
      type: 'clip_merge',
      data: { trackId, clipId1, clipId2, removedClip: secondClip }
    })

    this.notify()
    this.saveTimeline()
  }

  // Copy clip
  copyClip(trackId: string, clipId: string): void {
    const track = this.state.tracks.find(t => t.id === trackId)
    const clip = track?.clips.find(c => c.id === clipId)
    
    if (!track || !clip) return

    // Store in sessionStorage for copying across sessions
    const clipData = { ...clip }
    sessionStorage.setItem('timeline_clipboard', JSON.stringify({ clip: clipData, trackId }))
  }

  // Paste clip at current time
  pasteClip(targetTrackId: string, targetTime: number): void {
    const clipboardData = sessionStorage.getItem('timeline_clipboard')
    if (!clipboardData) return

    try {
      const { clip: sourceClip, trackId: sourceTrackId } = JSON.parse(clipboardData)
      const targetTrack = this.state.tracks.find(t => t.id === targetTrackId)
      
      if (!targetTrack || targetTrack.locked) return
      if (targetTrack.type !== sourceClip.type) return // Must be same type

      const newClip: TimelineClip = {
        ...sourceClip,
        id: generateId(),
        start: targetTime,
        end: targetTime + sourceClip.duration
      }

      // Check for conflicts with existing clips
      const hasConflict = targetTrack.clips.some(existingClip => 
        newClip.start < existingClip.end && newClip.end > existingClip.start
      )

      if (hasConflict) return

      targetTrack.clips.push(newClip)
      targetTrack.clips.sort((a, b) => a.start - b.start)

      this.notify()
      this.saveTimeline()
    } catch (error) {
      console.error('Failed to paste clip:', error)
    }
  }

  // Toggle track property
  toggleTrack(trackId: string, property: 'visible' | 'muted' | 'locked'): void {
    const track = this.state.tracks.find(t => t.id === trackId)
    if (!track) return

    switch (property) {
      case 'visible':
        track.visible = !track.visible
        break
      case 'muted':
        track.muted = !track.muted
        break
      case 'locked':
        track.locked = !track.locked
        break
    }

    this.addToHistory({
      type: 'track_edit',
      data: { trackId, property, oldValue: !track[property] }
    })

    this.notify()
    this.saveTimeline()
  }

  // Update current time
  setCurrentTime(time: number): void {
    this.state.currentTime = Math.max(0, Math.min(time, this.state.duration))
    this.notify()
  }

  // Undo last action
  undo(): boolean {
    if (this.state.historyIndex < 0) return false

    const action = this.state.history[this.state.historyIndex]
    this.state.historyIndex--

    // Apply reverse operation based on action type
    switch (action.type) {
      case 'clip_edit':
        this.reverseClipEdit(action.data)
        break
      case 'clip_delete':
        this.reverseClipDelete(action.data)
        break
      case 'clip_split':
        this.reverseClipSplit(action.data)
        break
      case 'clip_merge':
        this.reverseClipMerge(action.data)
        break
      case 'track_edit':
        this.reverseTrackEdit(action.data)
        break
    }

    this.notify()
    this.saveTimeline()
    return true
  }

  // Redo next action
  redo(): boolean {
    if (this.state.historyIndex >= this.state.history.length - 1) return false

    this.state.historyIndex++
    const action = this.state.history[this.state.historyIndex]

    // Reapply the action
    switch (action.type) {
      case 'clip_edit':
        this.applyClipEdit(action.data)
        break
      case 'clip_delete':
        this.applyClipDelete(action.data)
        break
      case 'clip_split':
        this.applyClipSplit(action.data)
        break
      case 'clip_merge':
        this.applyClipMerge(action.data)
        break
      case 'track_edit':
        this.applyTrackEdit(action.data)
        break
    }

    this.notify()
    this.saveTimeline()
    return true
  }

  // Helper methods for undo/redo operations
  private reverseClipEdit(data: any): void {
    const track = this.state.tracks.find(t => t.id === data.trackId)
    const clip = track?.clips.find(c => c.id === data.clipId)
    if (track && clip) {
      Object.assign(clip, data.originalClip)
    }
  }

  private applyClipEdit(data: any): void {
    const track = this.state.tracks.find(t => t.id === data.trackId)
    const clip = track?.clips.find(c => c.id === data.clipId)
    if (track && clip) {
      Object.assign(clip, data.updates)
    }
  }

  private reverseClipDelete(data: any): void {
    const track = this.state.tracks.find(t => t.id === data.trackId)
    if (track) {
      track.clips.splice(data.clipIndex, 0, data.clip)
    }
  }

  private applyClipDelete(data: any): void {
    const track = this.state.tracks.find(t => t.id === data.trackId)
    if (track) {
      const clipIndex = track.clips.findIndex(c => c.id === data.clipId)
      if (clipIndex !== -1) {
        track.clips.splice(clipIndex, 1)
      }
    }
  }

  private reverseClipSplit(data: any): void {
    // Find and remove the second clip, extend the first
    const track = this.state.tracks.find(t => t.id === data.trackId)
    const firstClip = track?.clips.find(c => c.id === data.clipId)
    const secondClipIndex = track?.clips.findIndex(c => c.id === data.newClipId)
    
    if (track && firstClip && secondClipIndex !== undefined && secondClipIndex !== -1) {
      const secondClip = track.clips[secondClipIndex]
      firstClip.end = secondClip.end
      firstClip.duration = firstClip.end - firstClip.start
      if (firstClip.sourceEnd && secondClip.sourceEnd) {
        firstClip.sourceEnd = secondClip.sourceEnd
      }
      track.clips.splice(secondClipIndex, 1)
    }
  }

  private applyClipSplit(data: any): void {
    this.splitClip(data.trackId, data.clipId, data.splitTime)
  }

  private reverseClipMerge(data: any): void {
    // Re-insert the removed clip and restore the first clip's original state
    const track = this.state.tracks.find(t => t.id === data.trackId)
    const firstClip = track?.clips.find(c => c.id === data.clipId1)
    
    if (track && firstClip) {
      // Split the merged clip back
      firstClip.end = data.removedClip.start
      firstClip.duration = firstClip.end - firstClip.start
      
      // Re-insert the removed clip
      track.clips.push(data.removedClip)
      track.clips.sort((a, b) => a.start - b.start)
    }
  }

  private applyClipMerge(data: any): void {
    this.mergeClips(data.trackId, data.clipId1, data.clipId2)
  }

  private reverseTrackEdit(data: any): void {
    const track = this.state.tracks.find(t => t.id === data.trackId)
    if (track) {
      (track as any)[data.property] = data.oldValue
    }
  }

  private applyTrackEdit(data: any): void {
    this.toggleTrack(data.trackId, data.property)
  }

  // Get timeline statistics
  getStatistics() {
    const totalClips = this.state.tracks.reduce((sum, track) => sum + track.clips.length, 0)
    const totalTracks = this.state.tracks.length
    const visibleTracks = this.state.tracks.filter(t => t.visible).length
    const lockedClips = this.state.tracks.reduce((sum, track) => 
      sum + track.clips.filter(c => c.locked).length, 0
    )

    return {
      totalClips,
      totalTracks,
      visibleTracks,
      lockedClips,
      duration: this.state.duration,
      canUndo: this.state.historyIndex >= 0,
      canRedo: this.state.historyIndex < this.state.history.length - 1
    }
  }
}

// Export utility functions
export const createTimelineOperations = (initialState?: Partial<TimelineState>) => {
  return new TimelineOperations(initialState)
}

// Convert transcript segments to timeline clips
export const transcriptToTimelineClips = (segments: any[]): TimelineClip[] => {
  return segments.map(segment => ({
    id: generateId(),
    start: segment.start,
    end: segment.end,
    duration: segment.end - segment.start,
    type: 'text' as const,
    label: segment.text.length > 30 ? segment.text.substring(0, 30) + '...' : segment.text,
    data: {
      text: segment.text,
      speaker: segment.speaker,
      confidence: segment.confidence
    },
    sourceStart: segment.start,
    sourceEnd: segment.end,
    volume: 1,
    opacity: 1,
    locked: false,
    effects: []
  }))
}

// Validate clip timing and detect conflicts
export const validateClipTiming = (tracks: TimelineTrack[]): { valid: boolean, conflicts: any[] } => {
  const conflicts: any[] = []
  
  tracks.forEach((track, trackIndex) => {
    track.clips.forEach((clip, clipIndex) => {
      // Check for invalid timing
      if (clip.start >= clip.end || clip.duration <= 0) {
        conflicts.push({
          type: 'invalid_timing',
          trackIndex,
          clipIndex,
          message: `Clip has invalid timing: start=${clip.start}, end=${clip.end}`
        })
      }
      
      // Check for overlaps with other clips on the same track
      track.clips.forEach((otherClip, otherIndex) => {
        if (clipIndex !== otherIndex && 
            clip.start < otherClip.end && clip.end > otherClip.start) {
          conflicts.push({
            type: 'overlap',
            trackIndex,
            clipIndex,
            otherClipIndex: otherIndex,
            message: `Clip overlaps with another clip on the same track`
          })
        }
      })
    })
  })
  
  return { valid: conflicts.length === 0, conflicts }
}
