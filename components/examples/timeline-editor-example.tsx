'use client'

import React, { useEffect } from 'react'
import { TimelineEditor } from '@/components/ui/timeline-editor'
import { useTimeline } from '@/lib/hooks/use-timeline'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

// Mock data for demonstration
const mockTimelineData = {
  id: 'timeline-1',
  name: 'Sample Video Project',
  duration: 180, // 3 minutes
  tracks: [
    {
      id: 'video-track-1',
      name: 'Main Video',
      type: 'video' as const,
      height: 80,
      visible: true,
      muted: false,
      locked: false,
      volume: 1.0,
      opacity: 1.0,
      color: 'blue',
      clips: [
        {
          id: 'clip-1',
          start: 0,
          end: 45,
          duration: 45,
          type: 'video' as const,
          label: 'Intro Sequence',
          color: 'blue',
          sourceStart: 0,
          sourceEnd: 45,
          volume: 1.0,
          opacity: 1.0,
          effects: [],
          locked: false
        },
        {
          id: 'clip-2',
          start: 50,
          end: 120,
          duration: 70,
          type: 'video' as const,
          label: 'Main Content',
          color: 'green',
          sourceStart: 60,
          sourceEnd: 130,
          volume: 1.0,
          opacity: 1.0,
          effects: [
            {
              id: 'fade-in',
              type: 'fade' as const,
              name: 'Fade In',
              parameters: { duration: 2 },
              startTime: 50,
              endTime: 52,
              enabled: true
            }
          ],
          locked: false
        },
        {
          id: 'clip-3',
          start: 125,
          end: 180,
          duration: 55,
          type: 'video' as const,
          label: 'Outro',
          color: 'purple',
          sourceStart: 0,
          sourceEnd: 55,
          volume: 1.0,
          opacity: 1.0,
          effects: [],
          locked: false
        }
      ]
    },
    {
      id: 'audio-track-1',
      name: 'Background Music',
      type: 'audio' as const,
      height: 60,
      visible: true,
      muted: false,
      locked: false,
      volume: 0.8,
      opacity: 1.0,
      color: 'green',
      waveformData: Array.from({ length: 1000 }, (_, i) => {
        const t = (i / 1000) * Math.PI * 8
        return Math.abs(Math.sin(t) * Math.cos(t * 0.5) * Math.exp(-t * 0.1))
      }),
      clips: [
        {
          id: 'audio-clip-1',
          start: 10,
          end: 170,
          duration: 160,
          type: 'audio' as const,
          label: 'Background Music',
          color: 'green',
          sourceStart: 0,
          sourceEnd: 160,
          volume: 0.6,
          opacity: 1.0,
          effects: [
            {
              id: 'fade-in-audio',
              type: 'fade' as const,
              name: 'Audio Fade In',
              parameters: { duration: 3 },
              startTime: 10,
              endTime: 13,
              enabled: true
            },
            {
              id: 'fade-out-audio',
              type: 'fade' as const,
              name: 'Audio Fade Out',
              parameters: { duration: 5 },
              startTime: 165,
              endTime: 170,
              enabled: true
            }
          ],
          locked: false
        }
      ]
    },
    {
      id: 'text-track-1',
      name: 'Subtitles',
      type: 'text' as const,
      height: 50,
      visible: true,
      muted: false,
      locked: false,
      volume: 1.0,
      opacity: 1.0,
      color: 'yellow',
      clips: [
        {
          id: 'text-clip-1',
          start: 5,
          end: 15,
          duration: 10,
          type: 'text' as const,
          label: 'Welcome to our tutorial',
          color: 'yellow',
          data: { text: 'Welcome to our tutorial', fontSize: 24, position: 'bottom' },
          sourceStart: 5,
          sourceEnd: 15,
          volume: 1.0,
          opacity: 1.0,
          effects: [],
          locked: false
        },
        {
          id: 'text-clip-2',
          start: 30,
          end: 45,
          duration: 15,
          type: 'text' as const,
          label: 'This is the main content section',
          color: 'yellow',
          data: { text: 'This is the main content section', fontSize: 20, position: 'bottom' },
          sourceStart: 30,
          sourceEnd: 45,
          volume: 1.0,
          opacity: 1.0,
          effects: [],
          locked: false
        }
      ]
    }
  ],
  settings: {
    frameRate: 30,
    resolution: { width: 1920, height: 1080 },
    sampleRate: 48000,
    pixelsPerSecond: 20,
    snapToGrid: true,
    gridInterval: 1
  }
}

export const TimelineEditorExample: React.FC = () => {
  const timeline = useTimeline({
    frameRate: 30,
    autoSave: true,
    autoSaveDelay: 3000,
    maxHistorySize: 50
  })

  // Initialize with mock data
  useEffect(() => {
    // Simulate loading timeline data
    setTimeout(() => {
      timeline.loadTimeline('mock-timeline-id')
      // Set mock data (in real app this would come from the service)
      // For demo purposes, we'll manually set the timeline data
    }, 500)
  }, [])

  // Add sample clips for testing
  const addSampleClips = () => {
    if (!timeline.timeline) return

    const videoTrack = timeline.timeline.tracks.find(t => t.type === 'video')
    if (videoTrack) {
      timeline.addClip(videoTrack.id, {
        start: timeline.currentTime,
        end: timeline.currentTime + 30,
        duration: 30,
        type: 'video',
        label: 'New Video Clip',
        color: 'orange',
        sourceStart: 0,
        sourceEnd: 30,
        volume: 1.0,
        opacity: 1.0,
        effects: [],
        locked: false
      })
    }
  }

  const addNewTrack = () => {
    const trackTypes = ['video', 'audio', 'text', 'overlay'] as const
    const randomType = trackTypes[Math.floor(Math.random() * trackTypes.length)]
    
    timeline.addTrack({
      name: `${randomType.charAt(0).toUpperCase() + randomType.slice(1)} Track ${Date.now()}`,
      type: randomType,
      height: randomType === 'text' ? 50 : 80,
      visible: true,
      muted: false,
      locked: false,
      volume: 1.0,
      opacity: 1.0,
      color: ['blue', 'green', 'purple', 'orange', 'red'][Math.floor(Math.random() * 5)]
    })
  }

  const exportTimeline = async () => {
    const exportData = await timeline.exportData()
    console.log('Exported timeline data:', exportData)
    
    // In a real app, this would trigger the export process
    alert('Timeline export started! Check console for details.')
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Professional Timeline Editor</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={timeline.isDirty ? 'destructive' : 'secondary'}>
                {timeline.isDirty ? 'Unsaved' : 'Saved'}
              </Badge>
              <Badge variant="outline">
                {timeline.selectedClips.length} clips selected
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {timeline.error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              Error: {timeline.error}
            </div>
          )}
          
          {timeline.isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">Loading timeline...</div>
            </div>
          ) : timeline.timeline ? (
            <div className="space-y-4">
              {/* Control Panel */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={timeline.togglePlayPause}
                  >
                    {timeline.isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => timeline.seek(0)}
                  >
                    Reset
                  </Button>
                </div>
                
                <Separator orientation="vertical" className="h-8" />
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addSampleClips}
                    disabled={!timeline.timeline}
                  >
                    Add Sample Clip
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addNewTrack}
                  >
                    Add Track
                  </Button>
                </div>
                
                <Separator orientation="vertical" className="h-8" />
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={timeline.undo}
                    disabled={!timeline.canUndo}
                  >
                    Undo
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={timeline.redo}
                    disabled={!timeline.canRedo}
                  >
                    Redo
                  </Button>
                </div>
                
                <Separator orientation="vertical" className="h-8" />
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={timeline.saveTimeline}
                    disabled={!timeline.isDirty}
                  >
                    Save
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="default"
                    onClick={exportTimeline}
                    disabled={!timeline.timeline}
                  >
                    Export
                  </Button>
                </div>
              </div>

              {/* Timeline Editor */}
              <TimelineEditor
                tracks={timeline.timeline.tracks}
                duration={timeline.timeline.duration}
                currentTime={timeline.currentTime}
                isPlaying={timeline.isPlaying}
                playbackRate={timeline.playbackRate}
                onTimeChange={timeline.seek}
                onPlayPause={timeline.togglePlayPause}
                onPlaybackRateChange={timeline.setPlaybackRate}
                onClipEdit={timeline.updateClip}
                onClipDelete={timeline.deleteClip}
                onClipSplit={timeline.splitClip}
                onClipMerge={timeline.mergeClips}
                onClipCopy={(trackId: string, clipId: string) => timeline.copyClips([clipId])}
                onTrackToggle={timeline.toggleTrackProperty}
                onTrackEdit={timeline.updateTrack}
                onUndo={timeline.undo}
                onRedo={timeline.redo}
                className="border border-gray-200 rounded-lg"
                pixelsPerSecond={timeline.timeline.settings.pixelsPerSecond}
                snapToGrid={timeline.snapToGrid}
                gridInterval={timeline.gridInterval}
                showWaveforms={true}
                frameRate={timeline.timeline.settings.frameRate}
              />

              {/* Timeline Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">Duration</div>
                  <div className="text-lg font-semibold">
                    {Math.floor(timeline.timeline.duration / 60)}:
                    {(timeline.timeline.duration % 60).toFixed(0).padStart(2, '0')}
                  </div>
                </div>
                
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-sm text-green-600 font-medium">Tracks</div>
                  <div className="text-lg font-semibold">{timeline.timeline.tracks.length}</div>
                </div>
                
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="text-sm text-purple-600 font-medium">Total Clips</div>
                  <div className="text-lg font-semibold">
                    {timeline.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0)}
                  </div>
                </div>
                
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="text-sm text-orange-600 font-medium">Current Time</div>
                  <div className="text-lg font-semibold">
                    {Math.floor(timeline.currentTime / 60)}:
                    {(timeline.currentTime % 60).toFixed(1).padStart(4, '0')}
                  </div>
                </div>
              </div>

              {/* Keyboard Shortcuts Help */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-2">Keyboard Shortcuts</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-600">
                  <div><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Space</kbd> Play/Pause</div>
                  <div><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">J/K/L</kbd> Playback Control</div>
                  <div><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+S</kbd> Split Clip</div>
                  <div><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Delete</kbd> Delete Selected</div>
                  <div><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+C/V</kbd> Copy/Paste</div>
                  <div><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl+Z/Y</kbd> Undo/Redo</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">No timeline loaded</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default TimelineEditorExample