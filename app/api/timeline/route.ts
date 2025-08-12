import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const TimelineCreateSchema = z.object({
  mediaFileId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  settings: z.string(),
  duration: z.number(),
  tracks: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    type: z.string(),
    enabled: z.boolean().default(true),
    locked: z.boolean().default(false),
    volume: z.number().default(1),
    opacity: z.number().default(1),
    clips: z.array(z.object({
      id: z.string().optional(),
      name: z.string().optional(),
      sourceStart: z.number(),
      sourceEnd: z.number(),
      timelineStart: z.number(),
      duration: z.number(),
      enabled: z.boolean().default(true),
      locked: z.boolean().default(false),
      volume: z.number().default(1),
      opacity: z.number().default(1),
      effects: z.array(z.object({
        id: z.string().optional(),
        type: z.string(),
        name: z.string(),
        parameters: z.string(),
        startTime: z.number().optional(),
        endTime: z.number().optional(),
        enabled: z.boolean().default(true)
      })).default([])
    }))
  }))
})

const TimelineUpdateSchema = TimelineCreateSchema.extend({
  id: z.string()
})

// GET - Fetch timeline by mediaFileId or timelineId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mediaFileId = searchParams.get('mediaFileId')
    const timelineId = searchParams.get('timelineId')

    if (!mediaFileId && !timelineId) {
      return NextResponse.json(
        { error: 'mediaFileId or timelineId is required' },
        { status: 400 }
      )
    }

    let timeline

    if (timelineId) {
      timeline = await prisma.timeline.findUnique({
        where: { id: timelineId },
        include: {
          tracks: {
            include: {
              clips: {
                include: {
                  effects: true
                },
                orderBy: { timelineStart: 'asc' }
              }
            },
            orderBy: { order: 'asc' }
          }
        }
      })
    } else {
      timeline = await prisma.timeline.findFirst({
        where: { mediaFileId },
        include: {
          tracks: {
            include: {
              clips: {
                include: {
                  effects: true
                },
                orderBy: { timelineStart: 'asc' }
              }
            },
            orderBy: { order: 'asc' }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })
    }

    if (!timeline) {
      return NextResponse.json(
        { timeline: null },
        { status: 404 }
      )
    }

    return NextResponse.json({ timeline })
  } catch (error) {
    console.error('GET /api/timeline error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch timeline' },
      { status: 500 }
    )
  }
}

// POST - Create new timeline
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = TimelineCreateSchema.parse(body)

    // Check if media file exists
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: validatedData.mediaFileId }
    })

    if (!mediaFile) {
      return NextResponse.json(
        { error: 'Media file not found' },
        { status: 404 }
      )
    }

    // Create timeline with tracks and clips
    const timeline = await prisma.timeline.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        settings: validatedData.settings,
        duration: validatedData.duration,
        mediaFileId: validatedData.mediaFileId,
        tracks: {
          create: validatedData.tracks.map((track, index) => ({
            name: track.name,
            type: track.type,
            order: index,
            enabled: track.enabled,
            locked: track.locked,
            volume: track.volume,
            opacity: track.opacity,
            clips: {
              create: track.clips.map(clip => ({
                name: clip.name,
                sourceStart: clip.sourceStart,
                sourceEnd: clip.sourceEnd,
                timelineStart: clip.timelineStart,
                duration: clip.duration,
                enabled: clip.enabled,
                locked: clip.locked,
                volume: clip.volume,
                opacity: clip.opacity,
                effects: {
                  create: clip.effects.map((effect, effectIndex) => ({
                    type: effect.type,
                    name: effect.name,
                    parameters: effect.parameters,
                    startTime: effect.startTime,
                    endTime: effect.endTime,
                    enabled: effect.enabled,
                    order: effectIndex
                  }))
                }
              }))
            }
          }))
        }
      },
      include: {
        tracks: {
          include: {
            clips: {
              include: {
                effects: true
              },
              orderBy: { timelineStart: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      }
    })

    return NextResponse.json({ timeline }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('POST /api/timeline error:', error)
    return NextResponse.json(
      { error: 'Failed to create timeline' },
      { status: 500 }
    )
  }
}

// PUT - Update existing timeline
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = TimelineUpdateSchema.parse(body)

    // Check if timeline exists
    const existingTimeline = await prisma.timeline.findUnique({
      where: { id: validatedData.id },
      include: {
        tracks: {
          include: {
            clips: {
              include: {
                effects: true
              }
            }
          }
        }
      }
    })

    if (!existingTimeline) {
      return NextResponse.json(
        { error: 'Timeline not found' },
        { status: 404 }
      )
    }

    // Delete existing tracks, clips, and effects
    await prisma.effect.deleteMany({
      where: {
        clip: {
          track: {
            timelineId: validatedData.id
          }
        }
      }
    })

    await prisma.clip.deleteMany({
      where: {
        track: {
          timelineId: validatedData.id
        }
      }
    })

    await prisma.track.deleteMany({
      where: { timelineId: validatedData.id }
    })

    // Update timeline with new data
    const timeline = await prisma.timeline.update({
      where: { id: validatedData.id },
      data: {
        name: validatedData.name,
        description: validatedData.description,
        settings: validatedData.settings,
        duration: validatedData.duration,
        tracks: {
          create: validatedData.tracks.map((track, index) => ({
            name: track.name,
            type: track.type,
            order: index,
            enabled: track.enabled,
            locked: track.locked,
            volume: track.volume,
            opacity: track.opacity,
            clips: {
              create: track.clips.map(clip => ({
                name: clip.name,
                sourceStart: clip.sourceStart,
                sourceEnd: clip.sourceEnd,
                timelineStart: clip.timelineStart,
                duration: clip.duration,
                enabled: clip.enabled,
                locked: clip.locked,
                volume: clip.volume,
                opacity: clip.opacity,
                effects: {
                  create: clip.effects.map((effect, effectIndex) => ({
                    type: effect.type,
                    name: effect.name,
                    parameters: effect.parameters,
                    startTime: effect.startTime,
                    endTime: effect.endTime,
                    enabled: effect.enabled,
                    order: effectIndex
                  }))
                }
              }))
            }
          }))
        }
      },
      include: {
        tracks: {
          include: {
            clips: {
              include: {
                effects: true
              },
              orderBy: { timelineStart: 'asc' }
            }
          },
          orderBy: { order: 'asc' }
        }
      }
    })

    return NextResponse.json({ timeline })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      )
    }

    console.error('PUT /api/timeline error:', error)
    return NextResponse.json(
      { error: 'Failed to update timeline' },
      { status: 500 }
    )
  }
}

// DELETE - Delete timeline
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const timelineId = searchParams.get('timelineId')

    if (!timelineId) {
      return NextResponse.json(
        { error: 'timelineId is required' },
        { status: 400 }
      )
    }

    // Check if timeline exists
    const timeline = await prisma.timeline.findUnique({
      where: { id: timelineId }
    })

    if (!timeline) {
      return NextResponse.json(
        { error: 'Timeline not found' },
        { status: 404 }
      )
    }

    // Delete timeline (cascading delete will handle tracks, clips, effects)
    await prisma.timeline.delete({
      where: { id: timelineId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/timeline error:', error)
    return NextResponse.json(
      { error: 'Failed to delete timeline' },
      { status: 500 }
    )
  }
}
