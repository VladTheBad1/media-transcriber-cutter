import { PrismaClient } from '@prisma/client'

// Types for timeline operations
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

export interface TimelineData {
  id: string
  name: string
  duration: number
  tracks: TimelineTrack[]
  settings: {
    frameRate: number
    resolution: { width: number; height: number }
    sampleRate: number
    pixelsPerSecond: number
    snapToGrid: boolean
    gridInterval: number
  }
}

export interface TimelineAction {
  id: string
  type: 'clip_edit' | 'clip_delete' | 'clip_split' | 'clip_merge' | 'track_edit'
  data: any
  timestamp: number
}

export class TimelineService {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  // Create a new timeline
  async createTimeline(mediaFileId: string, name: string): Promise<TimelineData> {
    const timeline = await this.prisma.timeline.create({
      data: {
        name,
        mediaFileId,
        settings: JSON.stringify({
          frameRate: 30,
          resolution: { width: 1920, height: 1080 },
          sampleRate: 48000,
          pixelsPerSecond: 20,
          snapToGrid: true,
          gridInterval: 1
        }),
        tracks: {
          create: [
            {
              name: 'Video Track 1',
              type: 'video',
              order: 0,
              enabled: true,
              volume: 1.0,
              opacity: 1.0
            },
            {
              name: 'Audio Track 1',
              type: 'audio',
              order: 1,
              enabled: true,
              volume: 1.0,
              opacity: 1.0
            },
            {
              name: 'Text Track 1',
              type: 'text',
              order: 2,
              enabled: true,
              volume: 1.0,
              opacity: 1.0
            }
          ]
        }
      },
      include: {
        tracks: {
          include: {
            clips: {
              include: {
                effects: true
              }
            }
          },
          orderBy: { order: 'asc' }
        }
      }
    })

    return this.formatTimelineData(timeline)
  }

  // Load existing timeline
  async getTimeline(timelineId: string): Promise<TimelineData | null> {
    const timeline = await this.prisma.timeline.findUnique({
      where: { id: timelineId },
      include: {
        tracks: {
          include: {
            clips: {
              include: {
                effects: true
              }
            }
          },
          orderBy: { order: 'asc' }
        }
      }
    })

    if (!timeline) return null
    return this.formatTimelineData(timeline)
  }

  // Save timeline changes
  async updateTimeline(timelineId: string, updates: Partial<TimelineData>): Promise<void> {
    const updateData: any = {}

    if (updates.name) {
      updateData.name = updates.name
    }

    if (updates.duration) {
      updateData.duration = updates.duration
    }

    if (updates.settings) {
      updateData.settings = JSON.stringify(updates.settings)
    }

    await this.prisma.timeline.update({
      where: { id: timelineId },
      data: updateData
    })
  }

  // Add clip to track
  async addClip(trackId: string, clipData: Omit<TimelineClip, 'id'>): Promise<TimelineClip> {
    const clip = await this.prisma.clip.create({
      data: {
        trackId,
        name: clipData.label,
        sourceStart: clipData.sourceStart || clipData.start,
        sourceEnd: clipData.sourceEnd || clipData.end,
        timelineStart: clipData.start,
        duration: clipData.duration,
        enabled: !clipData.locked,
        locked: clipData.locked || false,
        volume: clipData.volume || 1.0,
        opacity: clipData.opacity || 1.0
      },
      include: {
        effects: true
      }
    })

    return this.formatClipData(clip)
  }

  // Update clip
  async updateClip(clipId: string, updates: Partial<TimelineClip>): Promise<void> {
    const updateData: any = {}

    if (updates.start !== undefined) {
      updateData.timelineStart = updates.start
    }
    if (updates.end !== undefined) {
      updateData.duration = updates.end - (updates.start || 0)
    }
    if (updates.duration !== undefined) {
      updateData.duration = updates.duration
    }
    if (updates.sourceStart !== undefined) {
      updateData.sourceStart = updates.sourceStart
    }
    if (updates.sourceEnd !== undefined) {
      updateData.sourceEnd = updates.sourceEnd
    }
    if (updates.volume !== undefined) {
      updateData.volume = updates.volume
    }
    if (updates.opacity !== undefined) {
      updateData.opacity = updates.opacity
    }
    if (updates.locked !== undefined) {
      updateData.locked = updates.locked
      updateData.enabled = !updates.locked
    }
    if (updates.label !== undefined) {
      updateData.name = updates.label
    }

    await this.prisma.clip.update({
      where: { id: clipId },
      data: updateData
    })
  }

  // Split clip at specified time
  async splitClip(clipId: string, splitTime: number): Promise<{ clip1: TimelineClip; clip2: TimelineClip }> {
    const originalClip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { effects: true }
    })

    if (!originalClip) {
      throw new Error('Clip not found')
    }

    // Calculate split parameters
    const splitOffset = splitTime - originalClip.timelineStart
    const sourceSplitTime = originalClip.sourceStart + splitOffset

    // Create second clip
    const clip2 = await this.prisma.clip.create({
      data: {
        trackId: originalClip.trackId,
        name: originalClip.name ? `${originalClip.name} (2)` : null,
        sourceStart: sourceSplitTime,
        sourceEnd: originalClip.sourceEnd,
        timelineStart: splitTime,
        duration: originalClip.duration - splitOffset,
        enabled: originalClip.enabled,
        locked: originalClip.locked,
        volume: originalClip.volume,
        opacity: originalClip.opacity
      },
      include: { effects: true }
    })

    // Update original clip
    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        sourceEnd: sourceSplitTime,
        duration: splitOffset
      }
    })

    // Get updated original clip
    const updatedClip1 = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { effects: true }
    })

    return {
      clip1: this.formatClipData(updatedClip1!),
      clip2: this.formatClipData(clip2)
    }
  }

  // Merge adjacent clips
  async mergeClips(clipId1: string, clipId2: string): Promise<TimelineClip> {
    const [clip1, clip2] = await Promise.all([
      this.prisma.clip.findUnique({ where: { id: clipId1 }, include: { effects: true } }),
      this.prisma.clip.findUnique({ where: { id: clipId2 }, include: { effects: true } })
    ])

    if (!clip1 || !clip2) {
      throw new Error('Clips not found')
    }

    if (clip1.trackId !== clip2.trackId) {
      throw new Error('Cannot merge clips from different tracks')
    }

    // Determine order and merge parameters
    const firstClip = clip1.timelineStart <= clip2.timelineStart ? clip1 : clip2
    const secondClip = clip1.timelineStart <= clip2.timelineStart ? clip2 : clip1

    // Update first clip to span both
    const mergedClip = await this.prisma.clip.update({
      where: { id: firstClip.id },
      data: {
        duration: (secondClip.timelineStart + secondClip.duration) - firstClip.timelineStart,
        sourceEnd: secondClip.sourceEnd
      },
      include: { effects: true }
    })

    // Delete second clip
    await this.prisma.clip.delete({
      where: { id: secondClip.id }
    })

    return this.formatClipData(mergedClip)
  }

  // Delete clip
  async deleteClip(clipId: string): Promise<void> {
    await this.prisma.clip.delete({
      where: { id: clipId }
    })
  }

  // Add track
  async addTrack(timelineId: string, trackData: Omit<TimelineTrack, 'id' | 'clips'>): Promise<TimelineTrack> {
    const existingTracksCount = await this.prisma.track.count({
      where: { timelineId }
    })

    const track = await this.prisma.track.create({
      data: {
        timelineId,
        name: trackData.name,
        type: trackData.type,
        order: existingTracksCount,
        enabled: trackData.visible,
        locked: trackData.locked || false,
        volume: trackData.volume || 1.0,
        opacity: trackData.opacity || 1.0,
        settings: trackData.color ? JSON.stringify({ color: trackData.color }) : null
      },
      include: {
        clips: {
          include: { effects: true }
        }
      }
    })

    return this.formatTrackData(track)
  }

  // Update track
  async updateTrack(trackId: string, updates: Partial<TimelineTrack>): Promise<void> {
    const updateData: any = {}

    if (updates.name) updateData.name = updates.name
    if (updates.visible !== undefined) updateData.enabled = updates.visible
    if (updates.locked !== undefined) updateData.locked = updates.locked
    if (updates.volume !== undefined) updateData.volume = updates.volume
    if (updates.opacity !== undefined) updateData.opacity = updates.opacity
    if (updates.color !== undefined) {
      updateData.settings = JSON.stringify({ color: updates.color })
    }

    await this.prisma.track.update({
      where: { id: trackId },
      data: updateData
    })
  }

  // Generate waveform data for audio tracks
  async generateWaveformData(mediaFilePath: string, samples: number = 1000): Promise<number[]> {
    // This would typically use FFmpeg or a similar tool to extract audio samples
    // For now, return mock data - in a real implementation, you'd process the actual audio
    const mockWaveform = Array.from({ length: samples }, (_, i) => {
      const t = (i / samples) * Math.PI * 8
      return Math.abs(Math.sin(t) * Math.cos(t * 0.5) * Math.exp(-t * 0.1))
    })

    return mockWaveform
  }

  // Export timeline data for rendering
  async exportTimelineData(timelineId: string): Promise<{
    timeline: TimelineData
    renderInstructions: any[]
  }> {
    const timeline = await this.getTimeline(timelineId)
    if (!timeline) {
      throw new Error('Timeline not found')
    }

    // Generate render instructions for FFmpeg or similar
    const renderInstructions = this.generateRenderInstructions(timeline)

    return {
      timeline,
      renderInstructions
    }
  }

  // Private helper methods
  private formatTimelineData(dbTimeline: any): TimelineData {
    return {
      id: dbTimeline.id,
      name: dbTimeline.name,
      duration: dbTimeline.duration,
      tracks: dbTimeline.tracks.map((track: any) => this.formatTrackData(track)),
      settings: dbTimeline.settings ? JSON.parse(dbTimeline.settings) : {
        frameRate: 30,
        resolution: { width: 1920, height: 1080 },
        sampleRate: 48000,
        pixelsPerSecond: 20,
        snapToGrid: true,
        gridInterval: 1
      }
    }
  }

  private formatTrackData(dbTrack: any): TimelineTrack {
    const settings = dbTrack.settings ? JSON.parse(dbTrack.settings) : {}
    
    return {
      id: dbTrack.id,
      name: dbTrack.name,
      type: dbTrack.type,
      clips: dbTrack.clips.map((clip: any) => this.formatClipData(clip)),
      height: 80, // Default height
      visible: dbTrack.enabled,
      muted: !dbTrack.enabled,
      locked: dbTrack.locked,
      volume: dbTrack.volume,
      opacity: dbTrack.opacity,
      color: settings.color
    }
  }

  private formatClipData(dbClip: any): TimelineClip {
    return {
      id: dbClip.id,
      start: dbClip.timelineStart,
      end: dbClip.timelineStart + dbClip.duration,
      duration: dbClip.duration,
      type: 'video', // Would be determined by track type
      label: dbClip.name,
      sourceStart: dbClip.sourceStart,
      sourceEnd: dbClip.sourceEnd,
      volume: dbClip.volume,
      opacity: dbClip.opacity,
      locked: dbClip.locked,
      effects: dbClip.effects?.map((effect: any) => ({
        id: effect.id,
        type: effect.type,
        name: effect.name,
        parameters: JSON.parse(effect.parameters),
        startTime: effect.startTime,
        endTime: effect.endTime,
        enabled: effect.enabled
      })) || []
    }
  }

  private generateRenderInstructions(timeline: TimelineData): any[] {
    // Generate FFmpeg-compatible render instructions
    const instructions: any[] = []

    timeline.tracks.forEach(track => {
      if (!track.visible) return

      track.clips.forEach(clip => {
        instructions.push({
          type: 'clip',
          trackType: track.type,
          startTime: clip.start,
          duration: clip.duration,
          sourceStart: clip.sourceStart,
          sourceEnd: clip.sourceEnd,
          volume: clip.volume,
          opacity: clip.opacity,
          effects: clip.effects?.filter(e => e.enabled)
        })
      })
    })

    return instructions
  }
}

// Export utility functions
export const createTimelineService = (prisma: PrismaClient) => new TimelineService(prisma)

// Frame-accurate time utilities
export const timeToFrame = (time: number, frameRate: number): number => {
  return Math.round(time * frameRate)
}

export const frameToTime = (frame: number, frameRate: number): number => {
  return frame / frameRate
}

export const snapToFrame = (time: number, frameRate: number): number => {
  return frameToTime(timeToFrame(time, frameRate), frameRate)
}

// Timeline validation utilities
export const validateClipOverlap = (clips: TimelineClip[]): boolean => {
  const sortedClips = [...clips].sort((a, b) => a.start - b.start)
  
  for (let i = 0; i < sortedClips.length - 1; i++) {
    if (sortedClips[i].end > sortedClips[i + 1].start) {
      return false
    }
  }
  
  return true
}

export const findClipAt = (clips: TimelineClip[], time: number): TimelineClip | undefined => {
  return clips.find(clip => time >= clip.start && time <= clip.end)
}

export const getTimelineStats = (timeline: TimelineData): {
  totalClips: number
  totalDuration: number
  trackTypes: Record<string, number>
  hasOverlaps: boolean
} => {
  const stats = {
    totalClips: 0,
    totalDuration: timeline.duration,
    trackTypes: {} as Record<string, number>,
    hasOverlaps: false
  }

  timeline.tracks.forEach(track => {
    stats.totalClips += track.clips.length
    stats.trackTypes[track.type] = (stats.trackTypes[track.type] || 0) + 1
    
    if (!validateClipOverlap(track.clips)) {
      stats.hasOverlaps = true
    }
  })

  return stats
}