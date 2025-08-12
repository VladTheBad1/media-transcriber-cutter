'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ExportSettings } from '@/components/ui/export-settings-client'
import { useExport } from '@/lib/hooks/use-export'
import { 
  Play, 
  Download, 
  FileVideo, 
  FileAudio, 
  Clock, 
  HardDrive, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  AlertTriangle,
  Zap
} from 'lucide-react'
import { cn, formatTime, formatFileSize } from '@/lib/utils'

// Mock data for demo
const MOCK_MEDIA_FILE = {
  id: 'demo-media-1',
  filename: 'sample-video.mp4',
  duration: 120, // 2 minutes
  fileSize: 50 * 1024 * 1024, // 50MB
  filePath: '/mock/sample-video.mp4',
  type: 'video',
  status: 'processed'
}

const MOCK_TIMELINE = {
  id: 'demo-timeline-1',
  duration: 90, // 1.5 minutes (edited)
  tracks: [
    {
      id: 'track-1',
      name: 'Main Video',
      type: 'video',
      clips: [
        {
          id: 'clip-1',
          start: 0,
          end: 45,
          sourceStart: 10,
          sourceEnd: 55
        },
        {
          id: 'clip-2', 
          start: 45,
          end: 90,
          sourceStart: 70,
          sourceEnd: 115
        }
      ]
    }
  ]
}

const EXPORT_SCENARIOS = [
  {
    id: 'simple-export',
    name: 'Simple Export',
    description: 'Export entire media file with preset',
    useTimeline: false,
    expectedResults: 'Full 2-minute video exported with selected preset settings'
  },
  {
    id: 'timeline-export',
    name: 'Timeline Export',
    description: 'Export edited timeline with cuts and clips',
    useTimeline: true,
    expectedResults: '90-second edited video with timeline cuts applied'
  },
  {
    id: 'batch-export',
    name: 'Batch Export',
    description: 'Export to multiple platforms simultaneously',
    useTimeline: false,
    isBatch: true,
    expectedResults: 'Multiple files for TikTok, Instagram, YouTube, and Twitter'
  }
]

export default function ExportDemoPage() {
  const [selectedScenario, setSelectedScenario] = useState(EXPORT_SCENARIOS[0])
  const [exportResults, setExportResults] = useState<any[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [demoStatus, setDemoStatus] = useState<'idle' | 'exporting' | 'completed' | 'error'>('idle')
  const [currentOperation, setCurrentOperation] = useState<string>('')

  const {
    currentJobs,
    queueStats,
    presets,
    isLoading,
    error,
    startExport,
    startBatchExport,
    generatePreview,
    getActiveJobs,
    getCompletedJobs,
    isQueueBusy
  } = useExport()

  // Demo export handler
  const handleDemoExport = async (settings: any) => {
    setDemoStatus('exporting')
    setCurrentOperation('Starting export...')
    setExportResults([])

    try {
      if (settings.batch) {
        // Batch export demo
        setCurrentOperation('Preparing batch export for multiple platforms...')
        
        const batchId = await startBatchExport({
          mediaFileId: MOCK_MEDIA_FILE.id,
          baseFilename: settings.baseFilename || 'demo-export',
          platforms: ['TikTok', 'Instagram', 'YouTube', 'Twitter'],
          options: {
            includeSubtitles: true,
            outputDirectory: 'demo-exports'
          }
        })

        if (batchId) {
          setExportResults([
            {
              platform: 'TikTok',
              status: 'completed',
              filename: 'demo-export_tiktok-vertical.mp4',
              fileSize: 15 * 1024 * 1024,
              resolution: '1080x1920',
              duration: 90
            },
            {
              platform: 'Instagram',
              status: 'completed', 
              filename: 'demo-export_instagram-reels.mp4',
              fileSize: 18 * 1024 * 1024,
              resolution: '1080x1920',
              duration: 90
            },
            {
              platform: 'YouTube',
              status: 'completed',
              filename: 'demo-export_youtube-shorts.mp4', 
              fileSize: 22 * 1024 * 1024,
              resolution: '1080x1920',
              duration: 90
            },
            {
              platform: 'Twitter',
              status: 'completed',
              filename: 'demo-export_twitter-video.mp4',
              fileSize: 12 * 1024 * 1024,
              resolution: '1280x720',
              duration: 90
            }
          ])
          setDemoStatus('completed')
          setCurrentOperation('Batch export completed successfully!')
        } else {
          throw new Error('Batch export failed to start')
        }
      } else {
        // Single export demo
        setCurrentOperation('Processing single export...')
        
        const jobId = await startExport({
          mediaFileId: selectedScenario.useTimeline ? undefined : MOCK_MEDIA_FILE.id,
          timelineId: selectedScenario.useTimeline ? MOCK_TIMELINE.id : undefined,
          presetId: settings.presetId,
          outputFilename: settings.outputFilename || 'demo-export.mp4',
          options: settings.options
        })

        if (jobId) {
          // Simulate export result
          const mockResult = {
            platform: settings.preset?.platform || 'Custom',
            status: 'completed',
            filename: settings.outputFilename || 'demo-export.mp4',
            fileSize: 20 * 1024 * 1024,
            resolution: settings.preset?.resolution || '1920x1080',
            duration: selectedScenario.useTimeline ? MOCK_TIMELINE.duration : MOCK_MEDIA_FILE.duration,
            processingTime: 45
          }
          
          setExportResults([mockResult])
          setDemoStatus('completed')
          setCurrentOperation('Export completed successfully!')
        } else {
          throw new Error('Export failed to start')
        }
      }
    } catch (exportError) {
      console.error('Demo export error:', exportError)
      setDemoStatus('error')
      setCurrentOperation(`Export failed: ${exportError instanceof Error ? exportError.message : 'Unknown error'}`)
    }
  }

  // Demo preview handler
  const handleDemoPreview = async (settings: any) => {
    setCurrentOperation('Generating preview...')
    
    try {
      const previewUrl = await generatePreview({
        mediaFileId: MOCK_MEDIA_FILE.id,
        presetId: settings.presetId,
        previewDuration: 10,
        startTime: 0
      })
      
      if (previewUrl) {
        setPreviewUrl(previewUrl)
        setCurrentOperation('Preview generated successfully!')
      } else {
        throw new Error('Preview generation failed')
      }
    } catch (previewError) {
      console.error('Demo preview error:', previewError)
      setCurrentOperation(`Preview failed: ${previewError instanceof Error ? previewError.message : 'Unknown error'}`)
    }
  }

  const resetDemo = () => {
    setDemoStatus('idle')
    setExportResults([])
    setPreviewUrl(null)
    setCurrentOperation('')
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Video Export System Demo
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Test the complete FFmpeg-based video export pipeline with timeline editing, 
          multi-platform presets, and batch processing capabilities.
        </p>
      </div>

      {/* Demo Status */}
      {demoStatus !== 'idle' && (
        <Alert className={cn(
          demoStatus === 'completed' && 'border-green-500 bg-green-50',
          demoStatus === 'error' && 'border-red-500 bg-red-50',
          demoStatus === 'exporting' && 'border-blue-500 bg-blue-50'
        )}>
          <div className="flex items-center gap-2">
            {demoStatus === 'exporting' && <RefreshCw className="h-4 w-4 animate-spin" />}
            {demoStatus === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
            {demoStatus === 'error' && <XCircle className="h-4 w-4 text-red-600" />}
            <span className="font-medium capitalize">{demoStatus}</span>
          </div>
          <AlertDescription className="mt-2">
            {currentOperation}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Demo Controls */}
        <div className="space-y-6">
          {/* Export Scenarios */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Export Scenarios
              </CardTitle>
              <CardDescription>
                Choose a demo scenario to test different export capabilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {EXPORT_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => setSelectedScenario(scenario)}
                  className={cn(
                    "w-full p-3 text-left rounded-lg border-2 transition-all",
                    selectedScenario.id === scenario.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                  )}
                >
                  <div className="font-medium">{scenario.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {scenario.description}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {scenario.useTimeline && (
                      <Badge variant="secondary" className="text-xs">
                        Timeline
                      </Badge>
                    )}
                    {scenario.isBatch && (
                      <Badge variant="secondary" className="text-xs">
                        Batch
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Mock Media Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileVideo className="h-5 w-5" />
                Demo Media File
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Filename:</span>
                  <span className="font-medium">{MOCK_MEDIA_FILE.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration:</span>
                  <span className="font-medium">{formatTime(MOCK_MEDIA_FILE.duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">File Size:</span>
                  <span className="font-medium">{formatFileSize(MOCK_MEDIA_FILE.fileSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium capitalize">{MOCK_MEDIA_FILE.type}</span>
                </div>
                {selectedScenario.useTimeline && (
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-gray-600">Timeline Duration:</span>
                    <span className="font-medium text-blue-600">
                      {formatTime(MOCK_TIMELINE.duration)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Queue Stats */}
          {queueStats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className={cn(
                    "h-5 w-5",
                    isQueueBusy() && "animate-spin"
                  )} />
                  Export Queue
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="font-medium">{queueStats.totalJobs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Processing:</span>
                    <span className="font-medium text-blue-600">{queueStats.processingJobs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Queued:</span>
                    <span className="font-medium text-yellow-600">{queueStats.queuedJobs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completed:</span>
                    <span className="font-medium text-green-600">{queueStats.completedJobs}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reset Demo */}
          <Button 
            onClick={resetDemo}
            variant="outline"
            className="w-full"
            disabled={demoStatus === 'exporting'}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Demo
          </Button>
        </div>

        {/* Middle Column - Export Settings */}
        <div>
          <ExportSettings
            mediaFileId={selectedScenario.useTimeline ? undefined : MOCK_MEDIA_FILE.id}
            timelineId={selectedScenario.useTimeline ? MOCK_TIMELINE.id : undefined}
            duration={selectedScenario.useTimeline ? MOCK_TIMELINE.duration : MOCK_MEDIA_FILE.duration}
            onExport={handleDemoExport}
            onPreview={handleDemoPreview}
            isExporting={demoStatus === 'exporting'}
            exportProgress={demoStatus === 'exporting' ? 65 : 0}
          />
        </div>

        {/* Right Column - Results */}
        <div className="space-y-6">
          {/* Export Results */}
          {exportResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Export Results
                </CardTitle>
                <CardDescription>
                  {selectedScenario.expectedResults}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {exportResults.map((result, index) => (
                  <div 
                    key={index}
                    className="p-4 border rounded-lg space-y-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{result.platform}</div>
                      <Badge 
                        variant={result.status === 'completed' ? 'default' : 'secondary'}
                        className={result.status === 'completed' ? 'bg-green-100 text-green-800' : ''}
                      >
                        {result.status}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">File:</span>
                        <p className="font-medium truncate" title={result.filename}>
                          {result.filename}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Size:</span>
                        <p className="font-medium">{formatFileSize(result.fileSize)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Resolution:</span>
                        <p className="font-medium">{result.resolution}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Duration:</span>
                        <p className="font-medium">{formatTime(result.duration)}</p>
                      </div>
                      {result.processingTime && (
                        <div className="col-span-2">
                          <span className="text-gray-600">Processing Time:</span>
                          <p className="font-medium">{result.processingTime}s</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                      <Button size="sm" variant="outline">
                        <Play className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Preview */}
          {previewUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Export Preview
                </CardTitle>
                <CardDescription>
                  10-second preview of export settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <FileVideo className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-500">Preview would play here</p>
                    <p className="text-xs text-gray-400">
                      URL: {previewUrl}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Play className="h-4 w-4 mr-2" />
                    Play Preview
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* System Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle>System Capabilities</CardTitle>
              <CardDescription>
                Export system features and supported formats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Video Formats</h4>
                <div className="flex flex-wrap gap-1">
                  {['MP4', 'WebM', 'MOV', 'AVI'].map(format => (
                    <Badge key={format} variant="secondary" className="text-xs">
                      {format}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Audio Formats</h4>
                <div className="flex flex-wrap gap-1">
                  {['MP3', 'AAC', 'WAV', 'FLAC'].map(format => (
                    <Badge key={format} variant="secondary" className="text-xs">
                      {format}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Subtitle Formats</h4>
                <div className="flex flex-wrap gap-1">
                  {['SRT', 'VTT', 'ASS', 'Burned-in'].map(format => (
                    <Badge key={format} variant="secondary" className="text-xs">
                      {format}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Processing Features</h4>
                <div className="flex flex-wrap gap-1">
                  {[
                    'Auto-crop', 'Face tracking', 'Audio normalization', 
                    'Noise reduction', 'Color correction', 'Watermarks'
                  ].map(feature => (
                    <Badge key={feature} variant="outline" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
