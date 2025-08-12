'use client'

import React, { useState } from 'react'
import {
  MediaUpload,
  MediaPlayer,
  TranscriptViewer,
  TimelineEditor,
  ExportSettings,
  MediaLibrary
} from '@/components/ui'

// Mock data for demonstrations
const mockTranscript = [
  {
    id: '1',
    start: 0,
    end: 5.2,
    text: "Welcome everyone to today's podcast about media transcription technology.",
    speaker: 'Host',
    confidence: 0.95
  },
  {
    id: '2',
    start: 5.2,
    end: 12.8,
    text: "Today we're going to discuss how AI is revolutionizing the way we process and edit video content.",
    speaker: 'Host',
    confidence: 0.92
  },
  {
    id: '3',
    start: 12.8,
    end: 18.5,
    text: "That's exactly right. The technology has come so far in just the past few years.",
    speaker: 'Guest',
    confidence: 0.88
  }
]

const mockTracks = [
  {
    id: 'video-1',
    name: 'Video Track',
    type: 'video' as const,
    height: 80,
    visible: true,
    clips: [
      {
        id: 'clip-1',
        start: 0,
        end: 25.5,
        duration: 25.5,
        type: 'video' as const,
        label: 'Main Interview',
        color: 'blue'
      }
    ]
  },
  {
    id: 'audio-1',
    name: 'Audio Track',
    type: 'audio' as const,
    height: 60,
    visible: true,
    muted: false,
    clips: [
      {
        id: 'clip-2',
        start: 0,
        end: 25.5,
        duration: 25.5,
        type: 'audio' as const,
        label: 'Main Audio'
      }
    ]
  },
  {
    id: 'text-1',
    name: 'Transcript',
    type: 'text' as const,
    height: 40,
    visible: true,
    clips: [
      {
        id: 'clip-3',
        start: 0,
        end: 5.2,
        duration: 5.2,
        type: 'text' as const,
        label: 'Opening'
      },
      {
        id: 'clip-4',
        start: 5.2,
        end: 12.8,
        duration: 7.6,
        type: 'text' as const,
        label: 'Main Topic'
      },
      {
        id: 'clip-5',
        start: 12.8,
        end: 18.5,
        duration: 5.7,
        type: 'text' as const,
        label: 'Response'
      }
    ]
  }
]

const mockMediaFiles = [
  {
    id: '1',
    name: 'Interview_2024_01_15.mp4',
    type: 'video' as const,
    duration: 900, // 15 minutes
    size: 157286400, // ~150MB
    createdAt: new Date(Date.now() - 86400000), // Yesterday
    status: 'ready' as const,
    transcriptStatus: 'completed' as const,
    highlightsStatus: 'completed' as const,
    editStatus: 'draft' as const,
    thumbnail: '/api/placeholder/160/90'
  },
  {
    id: '2',
    name: 'Podcast_Episode_42.mp3',
    type: 'audio' as const,
    duration: 3600, // 1 hour
    size: 86400000, // ~82MB
    createdAt: new Date(Date.now() - 3 * 86400000), // 3 days ago
    status: 'ready' as const,
    transcriptStatus: 'completed' as const,
    highlightsStatus: 'processing' as const,
    editStatus: 'none' as const
  },
  {
    id: '3',
    name: 'Webinar_Recording.mov',
    type: 'video' as const,
    duration: 2700, // 45 minutes
    size: 524288000, // ~500MB
    createdAt: new Date(Date.now() - 7 * 86400000), // 1 week ago
    status: 'processing' as const,
    transcriptStatus: 'processing' as const,
    highlightsStatus: 'none' as const,
    editStatus: 'none' as const
  }
]

export default function ComponentsDemo() {
  const [currentTime, setCurrentTime] = useState(8.5)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  
  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Media Transcription & Editing Studio
          </h1>
          <p className="text-gray-400">
            UI Component Library Demo
          </p>
        </div>

        {/* Media Upload Component */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Media Upload</h2>
          <MediaUpload
            onFilesUploaded={(files) => {
              console.log('Files uploaded:', files.map(f => f.name))
            }}
            onUrlImport={(url) => {
              console.log('URL import requested:', url)
            }}
            className="max-w-2xl"
          />
        </section>

        {/* Media Player Component */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Media Player</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Video Player */}
            <div>
              <h3 className="text-lg font-medium text-gray-300 mb-2">Video Player</h3>
              <MediaPlayer
                src="/api/demo-video.mp4" // This would be a real video URL
                type="video"
                onTimeUpdate={setCurrentTime}
                transcript={mockTranscript}
                className="w-full"
              />
            </div>
            
            {/* Audio Player */}
            <div>
              <h3 className="text-lg font-medium text-gray-300 mb-2">Audio Player</h3>
              <MediaPlayer
                src="/api/demo-audio.mp3" // This would be a real audio URL
                type="audio"
                onTimeUpdate={setCurrentTime}
                transcript={mockTranscript}
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* Transcript Viewer Component */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Transcript Viewer</h2>
          <TranscriptViewer
            segments={mockTranscript}
            currentTime={currentTime}
            onSegmentClick={(segment) => {
              console.log('Segment clicked:', segment.text)
              setCurrentTime(segment.start + 0.1)
            }}
            onSegmentEdit={(segmentId, newText) => {
              console.log('Segment edited:', segmentId, newText)
            }}
            onSpeakerEdit={(segmentId, newSpeaker) => {
              console.log('Speaker edited:', segmentId, newSpeaker)
            }}
            onExport={(format) => {
              console.log('Export requested:', format)
            }}
            className="max-w-4xl"
          />
        </section>

        {/* Timeline Editor Component */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Timeline Editor</h2>
          <TimelineEditor
            tracks={mockTracks}
            duration={25.5}
            currentTime={currentTime}
            onTimeChange={setCurrentTime}
            onClipEdit={(trackId, clipId, updates) => {
              console.log('Clip edited:', { trackId, clipId, updates })
            }}
            onClipDelete={(trackId, clipId) => {
              console.log('Clip deleted:', { trackId, clipId })
            }}
            onClipSplit={(trackId, clipId, splitTime) => {
              console.log('Clip split:', { trackId, clipId, splitTime })
            }}
            onTrackToggle={(trackId, property) => {
              console.log('Track toggled:', { trackId, property })
            }}
            className="w-full"
          />
        </section>

        {/* Export Settings Component */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Export Settings</h2>
          <ExportSettings
            duration={25.5}
            onExport={(settings) => {
              console.log('Export started:', settings)
            }}
            className="max-w-4xl"
          />
        </section>

        {/* Media Library Component */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Media Library</h2>
          <MediaLibrary
            files={mockMediaFiles}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onFileSelect={(file) => {
              console.log('File selected:', file.name)
            }}
            onFileDelete={(fileId) => {
              console.log('File deleted:', fileId)
            }}
            onFileEdit={(fileId) => {
              console.log('File edited:', fileId)
            }}
            onImportFile={() => {
              console.log('Import file clicked')
            }}
            onImportUrl={() => {
              console.log('Import URL clicked')
            }}
            onBatchOperation={(fileIds, operation) => {
              console.log('Batch operation:', { fileIds, operation })
            }}
            className="w-full"
          />
        </section>

        {/* Usage Examples */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Usage Examples</h2>
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-300 mb-4">Component Integration</h3>
            <pre className="text-sm text-gray-300 bg-gray-900 p-4 rounded overflow-x-auto">
{`import {
  MediaUpload,
  MediaPlayer,
  TranscriptViewer,
  TimelineEditor,
  ExportSettings,
  MediaLibrary
} from '@/components/ui'

// Video player with transcript
<MediaPlayer 
  src="/video.mp4"
  type="video"
  transcript={transcript}
  onTimeUpdate={(time) => setCurrentTime(time)}
/>

// Interactive transcript
<TranscriptViewer
  segments={transcriptSegments}
  currentTime={currentTime}
  onSegmentClick={handleSegmentClick}
  onExport={handleExport}
/>

// Timeline editor
<TimelineEditor
  tracks={timelineTracks}
  duration={videoDuration}
  currentTime={currentTime}
  onTimeChange={setCurrentTime}
  onClipEdit={handleClipEdit}
/>`}
            </pre>
          </div>
        </section>

        {/* Features Summary */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Accessibility</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• ARIA labels and landmarks</li>
                <li>• Keyboard navigation support</li>
                <li>• Screen reader compatibility</li>
                <li>• High contrast support</li>
              </ul>
            </div>
            
            <div className="bg-gray-800 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-green-400 mb-2">Responsive Design</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• Mobile-first approach</li>
                <li>• Adaptive layouts</li>
                <li>• Touch-friendly interactions</li>
                <li>• Flexible grid systems</li>
              </ul>
            </div>
            
            <div className="bg-gray-800 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-purple-400 mb-2">Media Optimized</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• Frame-accurate seeking</li>
                <li>• Waveform visualization</li>
                <li>• Timeline scrubbing</li>
                <li>• Export presets</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}