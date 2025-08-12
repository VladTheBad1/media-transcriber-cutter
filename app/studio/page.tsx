"use client"

import { useState, useEffect } from 'react'
import { MediaUpload } from '@/components/ui/media-upload'
import { MediaLibrary } from '@/components/ui/media-library'
import { MediaPlayer } from '@/components/ui/media-player'
import { TranscriptViewer } from '@/components/ui/transcript-viewer'
import { TimelineWrapper } from '@/components/ui/timeline-wrapper'
import { ExportSettings } from '@/components/ui/export-settings-client'
import { TranscriptionProgress } from '@/components/ui/transcription-progress'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Upload, 
  Library, 
  Video, 
  FileText, 
  Edit, 
  Download,
  PlayCircle,
  Mic,
  Settings,
  Sparkles
} from 'lucide-react'

interface MediaFile {
  id: string
  name: string
  type: 'video' | 'audio'
  duration: number
  size: number
  createdAt: Date
  thumbnail?: string
  status: 'ready' | 'processing' | 'error' | 'transcribing'
  transcriptStatus?: 'none' | 'processing' | 'completed' | 'error'
  highlightsStatus?: 'none' | 'processing' | 'completed' | 'error'
  editStatus?: 'none' | 'draft' | 'completed'
}

interface Transcript {
  id: string
  mediaFileId: string
  language: string
  confidence: number
  status: string
  segments: TranscriptSegment[]
}

interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
  confidence: number
  speaker?: {
    id: string
    label: string
    name?: string
  }
}

export default function MediaStudioHome() {
  const [activeTab, setActiveTab] = useState('upload')
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState({
    progress: 0,
    timeElapsed: 0,
    estimatedTimeRemaining: 0,
    status: 'Initializing...'
  })
  const [uploadedFiles, setUploadedFiles] = useState<MediaFile[]>([])
  const [fileUrls, setFileUrls] = useState<Map<string, string>>(new Map())

  // Load media files from API on mount
  useEffect(() => {
    fetchMediaFiles()
  }, [])

  const fetchMediaFiles = async () => {
    try {
      const response = await fetch('/api/media/upload')
      if (response.ok) {
        const data = await response.json()
        const files = data.files.map((file: any) => ({
          id: file.id,
          name: file.originalName || file.filename,
          filename: file.filename,
          type: file.type as 'video' | 'audio',
          duration: file.duration || 0,
          size: file.size,
          createdAt: new Date(file.createdAt),
          thumbnail: file.thumbnailPath,
          status: file.status.toLowerCase() as any,
          transcriptStatus: file.transcript ? 
            (file.transcript.status === 'COMPLETED' ? 'completed' : 
             file.transcript.status === 'PROCESSING' ? 'processing' : 'error') : 'none',
          highlightsStatus: 'none' as const,
          editStatus: 'none' as const,
          metadata: {
            resolution: file.resolution
          }
        }))
        setUploadedFiles(files)
      }
    } catch (error) {
      console.error('Failed to fetch media files:', error)
    }
  }

  // Fetch transcript for a media file
  const fetchTranscript = async (mediaFileId: string) => {
    try {
      const response = await fetch(`/api/transcription?mediaFileId=${mediaFileId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.transcripts && data.transcripts.length > 0) {
          const latestTranscript = data.transcripts[0]
          // Fetch full transcript details
          const detailsResponse = await fetch(`/api/transcription?transcriptId=${latestTranscript.id}`)
          if (detailsResponse.ok) {
            const detailsData = await detailsResponse.json()
            const transcript = detailsData.transcript
            setTranscript({
              id: transcript.id,
              mediaFileId: transcript.mediaFileId,
              language: transcript.language,
              confidence: transcript.confidence,
              status: transcript.status,
              segments: transcript.segments.map((seg: any) => ({
                id: seg.id,
                start: seg.start,
                end: seg.end,
                text: seg.text,
                confidence: seg.confidence,
                speaker: seg.speaker
              }))
            })
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch transcript:', error)
    }
  }

  const handleMediaSelect = async (media: MediaFile) => {
    setSelectedMedia(media)
    // Check if transcript exists
    if (media.transcriptStatus === 'completed') {
      await fetchTranscript(media.id)
    } else {
      setTranscript(null)
    }
  }

  const handleTranscribeStart = async (mediaId: string) => {
    console.log('Starting transcription for media:', mediaId)
    setIsTranscribing(true)
    try {
      const response = await fetch('/api/transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFileId: mediaId,
          options: {
            language: 'auto',
            enableDiarization: true,
            model: 'large-v2'
          }
        })
      })
      console.log('Transcription response:', response.status, response.statusText)

      if (response.ok) {
        const data = await response.json()
        console.log('Transcription started:', data)
        
        // Poll for status updates
        const startTime = Date.now()
        const pollInterval = setInterval(async () => {
          const statusResponse = await fetch(`/api/transcription/status?transcriptId=${data.transcriptId}`)
          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            
            // Update progress
            const elapsed = (Date.now() - startTime) / 1000
            setTranscriptionProgress({
              progress: statusData.progress || 0,
              timeElapsed: elapsed,
              estimatedTimeRemaining: statusData.estimatedTimeRemaining || 0,
              status: statusData.message || 'Processing...'
            })
            
            if (statusData.status === 'COMPLETED') {
              clearInterval(pollInterval)
              setIsTranscribing(false)
              setTranscriptionProgress({
                progress: 100,
                timeElapsed: elapsed,
                estimatedTimeRemaining: 0,
                status: 'Completed!'
              })
              await fetchTranscript(mediaId)
              await fetchMediaFiles() // Refresh media list
            } else if (statusData.status === 'FAILED') {
              clearInterval(pollInterval)
              setIsTranscribing(false)
              console.error('Transcription failed:', statusData.error)
              alert(`Transcription failed: ${statusData.error || 'Unknown error'}`)
            }
          }
        }, 1000) // Poll every second for smoother progress updates
      } else {
        setIsTranscribing(false)
        const error = await response.json()
        console.error('Failed to start transcription:', error)
        alert(`Transcription failed: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      setIsTranscribing(false)
      console.error('Transcription error:', error)
      alert(`Error starting transcription: ${error}`)
    }
  }

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time)
  }

  const handleSegmentClick = (segment: TranscriptSegment) => {
    setCurrentTime(segment.start)
  }

  const handleUploadComplete = async (files: File[]) => {
    // Handle uploaded files
    console.log('Upload completed:', files)
    
    // Wait a moment for server processing
    setTimeout(async () => {
      await fetchMediaFiles()
      setActiveTab('library')
    }, 1000)
  }

  // Handle file deletion
  const handleFileDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) {
      return
    }
    
    try {
      const response = await fetch(`/api/media/${fileId}`, {
        method: "DELETE",
      })
      
      if (response.ok) {
        // Remove from state
        setUploadedFiles(prev => prev.filter(file => file.id !== fileId))
        
        // Clear selection if deleted file was selected
        if (selectedMedia?.id === fileId) {
          setSelectedMedia(null)
          setTranscript(null)
        }
        
        console.log("File deleted successfully")
      } else {
        const error = await response.json()
        console.error("Failed to delete file:", error)
        alert("Failed to delete file: " + error.error)
      }
    } catch (error) {
      console.error("Delete error:", error)
      alert("Failed to delete file")
    }
  }

  // Handle file editing (placeholder)
  const handleFileEdit = (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId)
    if (file) {
      setSelectedMedia(file)
      setActiveTab("studio")
    }
  }

  // Generate correct media URL for player
  const getMediaUrl = (media: MediaFile) => {
    return `/api/media/stream/${media.name}`
  }
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Media Transcription Studio
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  AI-powered transcription, editing, and social media optimization
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <PlayCircle className="h-3 w-3" />
                Server Running
              </Badge>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="library" className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              Library  
            </TabsTrigger>
            <TabsTrigger value="studio" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Studio
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Media Files
                </CardTitle>
                <CardDescription>
                  Upload video or audio files for transcription and editing. Supports files up to 5GB.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MediaUpload 
                  onFilesUploaded={handleUploadComplete}
                  onUrlImport={(url) => console.log('URL import:', url)}
                  maxFileSize={5 * 1024 * 1024 * 1024} // 5GB
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Library Tab */}
          <TabsContent value="library" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Library className="h-5 w-5" />
                  Media Library
                </CardTitle>
                <CardDescription>
                  Browse and manage your uploaded media files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MediaLibrary
                  files={uploadedFiles}
                  onFileSelect={handleMediaSelect}
                  onFileDelete={handleFileDelete}
                  onFileEdit={handleFileEdit}
                  onFileTranscribe={(file) => {
                    handleMediaSelect(file)
                    setActiveTab('studio')
                    setTimeout(() => handleTranscribeStart(file.id), 100)
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Studio Tab - Combined Player, Transcript & Editor */}
          <TabsContent value="studio" className="space-y-6">
            {selectedMedia ? (
              <div className="space-y-6">
                {/* Media Info Section */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <div className="lg:col-span-3">
                    {/* Timeline Editor with integrated player */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Edit className="h-5 w-5" />
                          Timeline Editor
                        </CardTitle>
                        <CardDescription>
                          Professional video editing with multi-track support, segment cutting, and transcript synchronization
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <TimelineWrapper
                          mediaFile={selectedMedia}
                          transcript={transcript}
                          currentTime={currentTime}
                          onTimeUpdate={handleTimeUpdate}
                          onSave={(success) => {
                            if (success) {
                              console.log('Timeline saved successfully')
                            } else {
                              console.error('Failed to save timeline')
                            }
                          }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                  <div>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Media Info</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-sm font-medium">Duration</p>
                          <p className="text-sm text-gray-600">
                            {selectedMedia.duration ? 
                              `${Math.floor(selectedMedia.duration / 60)}:${Math.floor(selectedMedia.duration % 60).toString().padStart(2, '0')}` :
                              'Unknown'
                            }
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Size</p>
                          <p className="text-sm text-gray-600">
                            {(selectedMedia.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium">Status</p>
                          <Badge variant={selectedMedia.status === 'ready' ? 'default' : 'secondary'}>
                            {selectedMedia.status}
                          </Badge>
                        </div>
                        
                        {/* Separator */}
                        <hr className="border-gray-200 dark:border-gray-700" />
                        
                        {/* Transcript Info */}
                        {transcript && (
                          <>
                            <div>
                              <p className="text-sm font-medium">Language</p>
                              <p className="text-sm text-gray-600">{transcript.language.toUpperCase()}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Confidence</p>
                              <p className="text-sm text-gray-600">{Math.round(transcript.confidence * 100)}%</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Segments</p>
                              <p className="text-sm text-gray-600">{transcript.segments.length}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Speakers</p>
                              <p className="text-sm text-gray-600">
                                {new Set(transcript.segments.map(s => s.speaker?.id).filter(Boolean)).size || 1}
                              </p>
                            </div>
                          </>
                        )}
                        
                        {!transcript && selectedMedia.status === 'ready' && (
                          isTranscribing ? (
                            <TranscriptionProgress
                              progress={transcriptionProgress.progress}
                              timeElapsed={transcriptionProgress.timeElapsed}
                              estimatedTimeRemaining={transcriptionProgress.estimatedTimeRemaining}
                              status={transcriptionProgress.status}
                            />
                          ) : (
                            <Button 
                              onClick={() => handleTranscribeStart(selectedMedia.id)}
                              disabled={isTranscribing}
                              className="w-full"
                            >
                              <Mic className="h-4 w-4 mr-2" />
                              Start Transcription
                            </Button>
                          )
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Transcript Section */}
                {transcript && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Transcript
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {transcript.segments.map((segment, index) => (
                          <div
                            key={segment.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                              currentTime >= segment.start && currentTime <= segment.end
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                            onClick={() => handleSegmentClick(segment)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 text-xs text-gray-500 font-mono">
                                {Math.floor(segment.start / 60)}:{(segment.start % 60).toFixed(1).padStart(4, '0')}
                              </div>
                              {segment.speaker && (
                                <div className="flex-shrink-0 text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                                  {segment.speaker.name || segment.speaker.label}
                                </div>
                              )}
                              <div className="flex-1 text-sm text-gray-900 dark:text-gray-100">
                                {segment.text}
                              </div>
                              <div className="flex-shrink-0 text-xs text-gray-400">
                                {Math.round(segment.confidence * 100)}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Video className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No media selected
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                    Select a media file from the library to start playback
                  </p>
                  <Button onClick={() => setActiveTab('library')}>
                    Go to Library
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-6">
            {selectedMedia ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Export Settings
                  </CardTitle>
                  <CardDescription>
                    Export your media for different platforms and formats
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ExportSettings
                    mediaFile={selectedMedia}
                    transcript={transcript}
                    duration={selectedMedia.duration || 0}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Download className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No media selected for export
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
                    Select a media file to configure export settings
                  </p>
                  <Button onClick={() => setActiveTab('library')}>
                    Select Media
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}