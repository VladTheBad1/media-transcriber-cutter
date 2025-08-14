'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Plus, Play, Pause, SkipBack, SkipForward, Trash2 } from 'lucide-react'
import { TimelineWrapper } from '@/components/ui/timeline-wrapper'
import { MediaPlayer, type MediaPlayerRef } from '@/components/ui/media-player'
import { EditableTranscript } from '@/components/ui/editable-transcript'
import { ResizableContainer } from '@/components/ui/resizable-container'
import { formatTime } from '@/lib/utils'

interface MediaFile {
  mediaId: string
  filename: string
  originalName: string
  title?: string | null
  type: 'video' | 'audio'
  format: string
  size: number
  duration: number
  resolution?: string
  thumbnailUrl?: string
  status: string
  uploadedAt: string
  hasTranscripts: boolean
  hasTimelines: boolean
  hasHighlights: boolean
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

export default function StudioPage() {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState<string | null>(null)
  const [transcriptionPercent, setTranscriptionPercent] = useState(0)
  const [transcriptionTimeRemaining, setTranscriptionTimeRemaining] = useState<number | null>(null)
  const [transcriptionStartTime, setTranscriptionStartTime] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{segmentId: string, start: number}[]>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isScrubbingTimeline, setIsScrubbingTimeline] = useState(false)
  const [wasPlayingBeforeScrub, setWasPlayingBeforeScrub] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaPlayerRef = useRef<MediaPlayerRef>(null)
  const transcriptContainerRef = useRef<HTMLDivElement>(null)

  // Load media files on mount
  useEffect(() => {
    fetchMediaFiles()
  }, [])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
      }
    }

    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [isPlaying])

  // Load transcript when file is selected
  useEffect(() => {
    if (selectedFile) {
      fetchTranscript(selectedFile.mediaId)
    }
  }, [selectedFile])

  // Search functionality
  useEffect(() => {
    if (!transcript || !searchQuery) {
      setSearchResults([])
      setCurrentSearchIndex(0)
      return
    }

    const results: {segmentId: string, start: number}[] = []
    transcript.segments.forEach(segment => {
      if (segment.text.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.push({ segmentId: segment.id, start: segment.start })
      }
    })

    setSearchResults(results)
    setCurrentSearchIndex(0)

    // Auto-jump to first result
    if (results.length > 0) {
      jumpToSearchResult(0, results)
    }
  }, [searchQuery, transcript])

  const jumpToSearchResult = (index: number, results = searchResults) => {
    if (results.length === 0) return
    
    const result = results[index]
    if (!result) return

    // Jump video to this time
    if (mediaPlayerRef.current) {
      mediaPlayerRef.current.seekTo(result.start)
    }
    setCurrentTime(result.start)

    // Scroll transcript to this segment
    const segmentElement = document.getElementById(`segment-${result.segmentId}`)
    if (segmentElement && transcriptContainerRef.current) {
      segmentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleSearchNavigation = (direction: 'prev' | 'next') => {
    if (searchResults.length === 0) return

    let newIndex = currentSearchIndex
    if (direction === 'next') {
      newIndex = (currentSearchIndex + 1) % searchResults.length
    } else {
      newIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1
    }

    setCurrentSearchIndex(newIndex)
    jumpToSearchResult(newIndex)
  }

  // Sync video player with timeline currentTime
  useEffect(() => {
    if (mediaPlayerRef.current && currentTime !== undefined) {
      // Only seek if there's a significant difference to avoid feedback loops
      const mediaElement = (mediaPlayerRef.current as any)?.mediaElement
      if (mediaElement && Math.abs(mediaElement.currentTime - currentTime) > 0.1) {
        mediaPlayerRef.current.seekTo(currentTime)
      }
    }
  }, [currentTime])

  const fetchMediaFiles = async () => {
    try {
      const response = await fetch('/api/media')
      if (response.ok) {
        const data = await response.json()
        const files = data.items || []
        setMediaFiles(files)
        
        // Auto-select first file if available
        if (files.length > 0 && !selectedFile) {
          setSelectedFile(files[0])
        }
      }
    } catch (error) {
      console.error('Failed to fetch media files:', error)
    }
  }

  const fetchTranscript = async (mediaFileId: string) => {
    try {
      const response = await fetch(`/api/transcript/${mediaFileId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.transcript) {
          setTranscript(data.transcript)
          return data.transcript
        } else {
          setTranscript(null)
          return null
        }
      }
    } catch (error) {
      console.error('Failed to fetch transcript:', error)
      setTranscript(null)
      return null
    }
  }

  const handleFileSelect = (file: MediaFile) => {
    setSelectedFile(file)
    setCurrentTime(0)
    setIsPlaying(false)
    if (mediaPlayerRef.current) {
      mediaPlayerRef.current.pause()
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    const formData = new FormData()
    formData.append('file', file)

    setIsUploading(true)
    try {
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        await fetchMediaFiles()
        
        // Auto-select the newly uploaded file
        if (data.mediaId) {
          // Find the newly uploaded file
          const newFile = mediaFiles.find(f => f.mediaId === data.mediaId)
          if (newFile) {
            setSelectedFile(newFile)
          }
        }
      }
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const getMediaUrl = (media: MediaFile) => {
    return `/api/media/stream/${media.filename}`
  }

  const togglePlayPause = () => {
    if (mediaPlayerRef.current) {
      if (isPlaying) {
        mediaPlayerRef.current.pause()
      } else {
        mediaPlayerRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleDeleteFile = async (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation() // Prevent file selection when clicking delete
    
    if (!confirm('Are you sure you want to delete this file?')) {
      return
    }

    try {
      const response = await fetch(`/api/media/${fileId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        // If deleted file was selected, clear selection
        if (selectedFile?.mediaId === fileId) {
          setSelectedFile(null)
        }
        // Refresh media files list
        await fetchMediaFiles()
      }
    } catch (error) {
      console.error('Failed to delete file:', error)
    }
  }

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <ResizableContainer
        id="top-bar"
        className="bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4"
        initialHeight={48}
        minHeight={32}
        maxHeight={100}
        resizeDirections={['top', 'right', 'bottom', 'left', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']}
        borderColor=""
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">PROJECT MEDIA</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 hover:bg-gray-800 rounded transition-colors"
            title="Import Media"
          >
            <Plus className="h-5 w-5 text-gray-400" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // Trigger save event for all containers
              window.dispatchEvent(new Event('save-layout'))
              // Show confirmation
              const notification = document.createElement('div')
              notification.textContent = 'Layout saved!'
              notification.className = 'fixed top-16 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-fade-in'
              document.body.appendChild(notification)
              setTimeout(() => notification.remove(), 2000)
            }}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
            title="Save current layout"
          >
            Save Layout
          </button>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
          >
            Export
          </button>
          {showExportMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
              <button
                onClick={() => {
                  console.log('Export video')
                  setShowExportMenu(false)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                🎬 Export Video
              </button>
              <button
                onClick={() => {
                  console.log('Export audio')
                  setShowExportMenu(false)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                🎵 Export Audio
              </button>
              <button
                onClick={() => {
                  console.log('Export transcript')
                  setShowExportMenu(false)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                📝 Export Transcript
              </button>
              <button
                onClick={() => {
                  console.log('Export video + audio')
                  setShowExportMenu(false)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors rounded-b-lg"
              >
                🎞️ Export Video + Audio
              </button>
            </div>
          )}
        </div>
      </ResizableContainer>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Upper Section */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Media Library */}
          <ResizableContainer
            id="media-library"
            className="bg-gray-900 border-r border-gray-800 flex flex-col"
            initialWidth={256}
            minWidth={150}
            maxWidth={600}
            resizeDirections={['top', 'right', 'bottom', 'left', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']}
            borderColor=""
          >
        {/* Library Header */}
        <div className="bg-gray-850 border-b border-gray-800 flex items-center px-3 h-8">
          <span className="text-xs text-gray-400">LIBRARIES</span>
        </div>
        
        {/* Media Items */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {/* Photos/All Events section like iMovie */}
            <div className="mb-2">
              <div className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400">
                <span className="text-gray-500">▼</span> Photos
              </div>
              <div className="ml-4 text-xs text-gray-500 px-2 py-1 hover:bg-gray-800 rounded cursor-pointer">
                All Events
              </div>
            </div>
            
            {/* Media Library section */}
            <div className="mb-2">
              <div className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400">
                <span className="text-gray-500">▼</span> Media Library
              </div>
              <div className="ml-4">
                {mediaFiles.map((file) => (
                  <div
                    key={file.mediaId}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy'
                      e.dataTransfer.setData('application/json', JSON.stringify(file))
                      e.currentTarget.style.opacity = '0.5'
                    }}
                    onDragEnd={(e) => {
                      e.currentTarget.style.opacity = '1'
                    }}
                    onClick={() => handleFileSelect(file)}
                    className={`group flex items-center justify-between px-2 py-1 text-xs rounded cursor-move transition-colors ${
                      selectedFile?.mediaId === file.mediaId 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <span className="truncate flex-1">{file.originalName}</span>
                    <button
                      onClick={(e) => handleDeleteFile(e, file.mediaId)}
                      className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-600/20 rounded transition-all"
                      title="Delete file"
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </button>
                  </div>
                ))}
                {mediaFiles.length === 0 && (
                  <div className="px-2 py-1 text-xs text-gray-500">
                    No media files
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </ResizableContainer>

        {/* Center - Media Thumbnails */}
        <ResizableContainer
          id="media-thumbnails"
          className="bg-gray-850 border-r border-gray-800 flex flex-col"
          initialWidth={320}
          minWidth={200}
          maxWidth={600}
          resizeDirections={['top', 'right', 'bottom', 'left', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']}
          borderColor=""
        >
        {/* Thumbnails Header */}
        <div className="bg-gray-900 border-b border-gray-800 flex items-center justify-between px-3 h-8">
          <span className="text-xs text-gray-400">My Media</span>
          <span className="text-xs text-gray-500">All Clips ▼</span>
        </div>
        
        {/* Thumbnails Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2">
            {mediaFiles.map((file) => (
              <div
                key={file.mediaId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy'
                  e.dataTransfer.setData('application/json', JSON.stringify(file))
                  // Add visual feedback
                  e.currentTarget.style.opacity = '0.5'
                }}
                onDragEnd={(e) => {
                  // Reset visual feedback
                  e.currentTarget.style.opacity = '1'
                }}
                onClick={() => handleFileSelect(file)}
                className={`relative aspect-video bg-gray-800 rounded overflow-hidden cursor-move border-2 transition-all ${
                  selectedFile?.mediaId === file.mediaId 
                    ? 'border-yellow-400' 
                    : 'border-transparent hover:border-gray-600'
                }`}
              >
                {file.filename ? (
                  <img
                    draggable={false}
                    src={`/thumbnails/${file.filename.replace('.mp4', '.jpg').replace('.webm', '.jpg').replace('.mov', '.jpg')}`}
                    alt={file.originalName}
                    className="w-full h-full object-cover pointer-events-none"
                    onError={(e) => {
                      // Fallback if thumbnail doesn't exist
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        parent.innerHTML = `
                          <div class="w-full h-full flex items-center justify-center">
                            <div class="text-center">
                              <div class="text-2xl mb-1">${file.type === 'video' ? '🎬' : '🎵'}</div>
                              <div class="text-xs text-gray-500 px-1 truncate">${file.originalName}</div>
                            </div>
                          </div>
                        `
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl mb-1">
                        {file.type === 'video' ? '🎬' : '🎵'}
                      </div>
                      <div className="text-xs text-gray-500 px-1 truncate">
                        {file.originalName}
                      </div>
                    </div>
                  </div>
                )}
                {/* Duration badge */}
                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                  {formatTime(file.duration)}
                </div>
              </div>
            ))}
            
            {/* Add Media Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="aspect-video bg-gray-800 rounded flex items-center justify-center hover:bg-gray-750 transition-colors border-2 border-dashed border-gray-700 hover:border-gray-600"
            >
              <Plus className="h-8 w-8 text-gray-600" />
            </button>
          </div>
        </div>
        </ResizableContainer>

        {/* Transcript Panel */}
        <ResizableContainer
          id="transcript-panel"
          className="bg-gray-900 border-r border-gray-800 flex flex-col"
          initialWidth={320}
          minWidth={200}
          maxWidth={600}
          resizeDirections={['top', 'right', 'bottom', 'left', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']}
          borderColor=""
        >
          <div className="bg-gray-850 border-b border-gray-800 flex items-center px-3 h-8">
            <span className="text-xs text-gray-400">TRANSCRIPT</span>
          </div>
          {/* Search Bar */}
          <div className="p-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search transcript..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-gray-800 text-gray-300 text-sm rounded border border-gray-700 focus:border-blue-500 focus:outline-none transition-colors"
              />
              {searchResults.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">
                    {currentSearchIndex + 1}/{searchResults.length}
                  </span>
                  <button
                    onClick={() => handleSearchNavigation('prev')}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Previous result"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleSearchNavigation('next')}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Next result"
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4" ref={transcriptContainerRef}>
            {selectedFile && transcript ? (
              <div className="space-y-3">
                {transcript.segments.map((segment) => {
                  const isActive = currentTime >= segment.start && currentTime <= segment.end
                  const isSearchResult = searchResults.some(r => r.segmentId === segment.id)
                  const isCurrentSearchResult = searchResults[currentSearchIndex]?.segmentId === segment.id
                  
                  return (
                    <div
                      id={`segment-${segment.id}`}
                      key={segment.id}
                      className={`p-3 rounded-lg cursor-pointer transition-all duration-300 ${
                        isCurrentSearchResult
                          ? 'bg-yellow-900/50 border-l-4 border-yellow-500 shadow-lg transform scale-[1.02]'
                          : isActive 
                          ? 'bg-blue-900/50 border-l-4 border-blue-500 shadow-lg transform scale-[1.02]' 
                          : isSearchResult
                          ? 'bg-gray-700 hover:bg-gray-650 border-l-4 border-yellow-500/30'
                          : 'bg-gray-800 hover:bg-gray-750 border-l-4 border-transparent'
                      }`}
                      onClick={() => {
                        if (mediaPlayerRef.current) {
                          mediaPlayerRef.current.seekTo(segment.start)
                        }
                        setCurrentTime(segment.start)
                      }}
                      ref={isActive && !isCurrentSearchResult ? (el) => {
                        // Auto-scroll to active segment only when playing
                        if (el && isPlaying) {
                          el.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                          })
                        }
                      } : undefined}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`text-xs font-mono mt-0.5 ${
                          isActive ? 'text-blue-400 font-bold' : 'text-yellow-500'
                        }`}>
                          {formatTime(segment.start)}
                        </span>
                        <EditableTranscript
                          segmentId={segment.id}
                          text={segment.text}
                          isActive={isActive}
                          searchTerm={searchQuery}
                          onTextChange={(segmentId, newText) => {
                            // Update the local transcript state
                            if (transcript) {
                              const updatedSegments = transcript.segments.map(s => 
                                s.id === segmentId ? { ...s, text: newText } : s
                              )
                              setTranscript({
                                ...transcript,
                                segments: updatedSegments
                              })
                            }
                          }}
                          className={`text-sm leading-relaxed flex-1 ${
                            isActive ? 'text-white font-medium' : 'text-gray-300'
                          }`}
                        />
                      </div>
                      {segment.speaker && (
                        <div className={`mt-2 text-xs ${
                          isActive ? 'text-blue-300' : 'text-gray-500'
                        }`}>
                          Speaker: {segment.speaker.label}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : selectedFile && !isTranscribing ? (
              <div className="text-center text-gray-500 mt-8">
                <div className="text-3xl mb-3">📝</div>
                <p className="text-sm">No transcript available</p>
                <button 
                  onClick={async () => {
                    if (selectedFile) {
                      setIsTranscribing(true)
                      setTranscriptionProgress('Starting WhisperX transcription...')
                      setTranscriptionPercent(0)
                      setTranscriptionTimeRemaining(null)
                      setTranscriptionStartTime(Date.now())
                      
                      try {
                        const response = await fetch('/api/transcribe', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            mediaFileId: selectedFile.mediaId,
                            options: {
                              model: 'large-v2',
                              language: 'auto',
                              enableDiarization: true,
                              device: 'auto'
                            }
                          })
                        })
                        
                        if (response.ok) {
                          const data = await response.json()
                          
                          // Connect to SSE for real-time progress
                          const eventSource = new EventSource(`/api/transcribe/progress?jobId=${data.jobId}&mediaFileId=${selectedFile.mediaId}`)
                          
                          eventSource.onmessage = (event) => {
                            const progressData = JSON.parse(event.data)
                            
                            if (progressData.type === 'progress') {
                              // Update progress percentage
                              if (progressData.progress !== undefined) {
                                setTranscriptionPercent(progressData.progress)
                                
                                // Calculate estimated time remaining using the current start time
                                if (progressData.progress > 0 && progressData.progress < 100) {
                                  // Get the current start time from state
                                  setTranscriptionStartTime((currentStartTime) => {
                                    const elapsed = Date.now() - (currentStartTime || Date.now())
                                    const estimatedTotal = (elapsed / progressData.progress) * 100
                                    const remaining = Math.max(0, estimatedTotal - elapsed)
                                    setTranscriptionTimeRemaining(remaining)
                                    
                                    // Update progress message
                                    const remainingSeconds = Math.ceil(remaining / 1000)
                                    const minutes = Math.floor(remainingSeconds / 60)
                                    const seconds = remainingSeconds % 60
                                    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
                                    setTranscriptionProgress(`Processing: ${progressData.progress.toFixed(0)}% - Est. ${timeStr} remaining`)
                                    
                                    return currentStartTime // Don't change the start time
                                  })
                                } else if (progressData.progress === 100) {
                                  setTranscriptionProgress('Processing: 100% - Finalizing...')
                                  setTranscriptionTimeRemaining(0)
                                }
                              }
                              
                              // Update status message
                              if (progressData.status === 'processing' && !progressData.progress) {
                                setTranscriptionProgress('Processing with WhisperX...')
                              } else if (progressData.status === 'pending') {
                                setTranscriptionProgress('Queued for processing...')
                              }
                            } else if (progressData.type === 'completed' || progressData.type === 'transcript') {
                              // Transcription completed
                              setTranscriptionPercent(100)
                              setTranscriptionProgress('Transcription completed!')
                              eventSource.close()
                              
                              // Fetch the transcript
                              setTimeout(async () => {
                                await fetchTranscript(selectedFile.mediaId)
                                setIsTranscribing(false)
                                setTranscriptionProgress(null)
                                setTranscriptionPercent(0)
                                setTranscriptionTimeRemaining(null)
                                setTranscriptionStartTime(null)
                              }, 1000)
                            } else if (progressData.type === 'failed' || progressData.type === 'error') {
                              // Transcription failed
                              eventSource.close()
                              setIsTranscribing(false)
                              setTranscriptionProgress(progressData.error || 'Transcription failed')
                              setTranscriptionPercent(0)
                              setTranscriptionTimeRemaining(null)
                              setTimeout(() => setTranscriptionProgress(null), 5000)
                            }
                          }
                          
                          eventSource.onerror = () => {
                            eventSource.close()
                            // Try to fetch transcript in case it completed
                            fetchTranscript(selectedFile.mediaId).then((result) => {
                              if (result) {
                                setIsTranscribing(false)
                                setTranscriptionProgress(null)
                                setTranscriptionPercent(0)
                              }
                            })
                          }
                        } else {
                          const error = await response.json()
                          if (error.status === 'COMPLETED') {
                            // Transcript already exists, fetch it
                            await fetchTranscript(selectedFile.mediaId)
                          }
                          setIsTranscribing(false)
                          setTranscriptionProgress(null)
                          setTranscriptionPercent(0)
                        }
                      } catch (error) {
                        console.error('Failed to start WhisperX transcription:', error)
                        setIsTranscribing(false)
                        setTranscriptionProgress('Failed to start transcription')
                        setTranscriptionPercent(0)
                        setTimeout(() => setTranscriptionProgress(null), 3000)
                      }
                    }
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                >
                  Generate Transcript with WhisperX
                </button>
              </div>
            ) : selectedFile && isTranscribing ? (
              <div className="text-center text-gray-500 mt-8 px-4">
                <div className="text-3xl mb-3 animate-pulse">🎙️</div>
                <p className="text-sm font-medium">Transcribing with WhisperX...</p>
                
                {/* Progress Bar */}
                <div className="mt-4 w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500 ease-out relative"
                    style={{ width: `${transcriptionPercent}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                  </div>
                </div>
                
                {/* Progress Text */}
                <div className="mt-3 flex justify-between items-center text-xs">
                  <span className="text-blue-400 font-medium">
                    {transcriptionPercent.toFixed(0)}%
                  </span>
                  {transcriptionProgress && (
                    <span className="text-gray-400">{transcriptionProgress}</span>
                  )}
                </div>
                
                {/* Time Remaining */}
                {transcriptionTimeRemaining !== null && transcriptionPercent > 0 && transcriptionPercent < 100 && (
                  <div className="mt-2 text-xs text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        Estimated time: {(() => {
                          const seconds = Math.ceil(transcriptionTimeRemaining / 1000);
                          const minutes = Math.floor(seconds / 60);
                          const secs = seconds % 60;
                          return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
                        })()}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Cancel Button */}
                <button
                  onClick={() => {
                    // TODO: Implement cancel functionality
                    setIsTranscribing(false)
                    setTranscriptionProgress(null)
                    setTranscriptionPercent(0)
                    setTranscriptionTimeRemaining(null)
                  }}
                  className="mt-4 px-3 py-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-500 mt-8">
                <p className="text-sm">Select a media file to view transcript</p>
              </div>
            )}
          </div>
          </ResizableContainer>
          
          {/* Video Preview - Right side, same level as Libraries/Media/Transcript */}
        <ResizableContainer
          id="video-preview"
          className="bg-gray-900 flex-1 flex flex-col overflow-hidden"
          minWidth={300}
          resizeDirections={['top', 'right', 'bottom', 'left', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']}
          borderColor=""
        >
        {selectedFile ? (
          <div className="h-full w-full flex flex-col overflow-hidden p-4">
          {/* Video Player */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
              <MediaPlayer
                ref={mediaPlayerRef}
                src={getMediaUrl(selectedFile)}
                type={selectedFile.type}
                onTimeUpdate={setCurrentTime}
                onSeek={setCurrentTime}
                controls={false}
                muted={isScrubbingTimeline}
                className="w-full h-full object-contain"
              />
          </div>
            
          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-2 py-2">
            <button
              onClick={() => {
                if (mediaPlayerRef.current) {
                  mediaPlayerRef.current.seekTo(Math.max(0, currentTime - 10))
                }
              }}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            
            <button
              onClick={togglePlayPause}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>
            
            <button
              onClick={() => {
                if (mediaPlayerRef.current) {
                  mediaPlayerRef.current.seekTo(Math.min(selectedFile.duration, currentTime + 10))
                }
              }}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-sm">Select a clip to preview</p>
            </div>
          </div>
        )}
          </ResizableContainer>
        </div>
        
        {/* Timeline - Bottom section, spans full width */}
        <ResizableContainer
          id="timeline"
          className="border-t border-gray-800 bg-gray-900"
          initialHeight={300}
          minHeight={100}
          maxHeight={600}
          resizeDirections={['top', 'right', 'bottom', 'left', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']}
          borderColor=""
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            // Add visual feedback
            e.currentTarget.style.backgroundColor = '#1f2937' // bg-gray-800
          }}
          onDragLeave={(e) => {
            // Remove visual feedback
            e.currentTarget.style.backgroundColor = '' // Reset to original
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.style.backgroundColor = '' // Reset background
            
            try {
              const fileData = e.dataTransfer.getData('application/json')
              if (fileData) {
                const file = JSON.parse(fileData) as MediaFile
                // Set the dropped file as selected
                setSelectedFile(file)
                // The timeline will automatically update via the useEffect
              }
            } catch (error) {
              console.error('Failed to handle drop:', error)
            }
          }}
        >
          {selectedFile ? (
            <TimelineWrapper
              mediaFile={selectedFile}
              transcript={transcript}
              currentTime={currentTime}
              onTimeUpdate={(time) => {
                setCurrentTime(time)
                // Also seek the video player when timeline is clicked
                if (mediaPlayerRef.current) {
                  mediaPlayerRef.current.seekTo(time)
                }
              }}
              onScrubbingChange={(isScrubbing) => {
                setIsScrubbingTimeline(isScrubbing)
                
                if (isScrubbing) {
                  // Starting scrubbing - pause if playing
                  if (isPlaying) {
                    setWasPlayingBeforeScrub(true)
                    if (mediaPlayerRef.current) {
                      mediaPlayerRef.current.pause()
                    }
                    setIsPlaying(false)
                  }
                } else {
                  // Stopping scrubbing - resume if was playing
                  if (wasPlayingBeforeScrub) {
                    if (mediaPlayerRef.current) {
                      mediaPlayerRef.current.play()
                    }
                    setIsPlaying(true)
                    setWasPlayingBeforeScrub(false)
                  }
                }
              }}
              className="h-full"
            />
          ) : (
            <div className="h-full flex items-center justify-center pointer-events-none">
              <div className="text-center text-gray-500">
                <div className="text-3xl mb-2">✂️</div>
                <p className="text-sm">Drag clips here to create your movie</p>
              </div>
            </div>
          )}
        </ResizableContainer>
      </div>
    </div>
  )
}