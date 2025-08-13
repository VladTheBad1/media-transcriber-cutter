'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Play, Pause, FileVideo, FileAudio, Mic, Loader2 } from 'lucide-react'
import { TimelineWrapper } from '@/components/ui/timeline-wrapper'
import { MediaPlayer, type MediaPlayerRef } from '@/components/ui/media-player'
import { formatTime, formatFileSize } from '@/lib/utils'

interface MediaFile {
  id: string
  name: string
  type: 'video' | 'audio'
  duration: number
  size: number
  createdAt: Date
  status: string
  thumbnail?: string
  filename?: string
  transcriptStatus?: 'none' | 'processing' | 'completed' | 'error'
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

export default function EditorPage() {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaPlayerRef = useRef<MediaPlayerRef>(null)

  // Load media files on mount
  useEffect(() => {
    fetchMediaFiles()
  }, [])

  // Load transcript when file is selected
  useEffect(() => {
    if (selectedFile) {
      fetchTranscript(selectedFile.id)
    }
  }, [selectedFile])

  const fetchMediaFiles = async () => {
    try {
      const response = await fetch('/api/media')
      if (response.ok) {
        const data = await response.json()
        setMediaFiles(data.files || [])
        
        // Auto-select first file if available
        if (data.files?.length > 0 && !selectedFile) {
          handleFileSelect(data.files[0])
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
        } else {
          setTranscript(null)
        }
      }
    } catch (error) {
      console.error('Failed to fetch transcript:', error)
      setTranscript(null)
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
        // Refresh media files
        await fetchMediaFiles()
        
        // Auto-select the newly uploaded file
        if (data.file) {
          handleFileSelect(data.file)
        }
      }
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleTranscribe = async () => {
    if (!selectedFile) return
    
    setIsTranscribing(true)
    try {
      const response = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaFileId: selectedFile.id })
      })

      if (response.ok) {
        // Poll for transcript completion
        const pollInterval = setInterval(async () => {
          const transcript = await fetchTranscript(selectedFile.id)
          if (transcript) {
            clearInterval(pollInterval)
            setIsTranscribing(false)
            // Refresh media files to update status
            await fetchMediaFiles()
          }
        }, 2000)
      }
    } catch (error) {
      console.error('Transcription failed:', error)
      setIsTranscribing(false)
    }
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

  const getMediaUrl = (media: MediaFile) => {
    const filename = media.filename || media.name
    return `/api/media/stream/${filename}`
  }

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time)
  }
  
  const handleSeek = (time: number) => {
    setCurrentTime(time)
    // When timeline seeks, update the media player
    if (mediaPlayerRef.current) {
      mediaPlayerRef.current.seekTo(time)
    }
  }

  const handlePlayStateChange = (playing: boolean) => {
    setIsPlaying(playing)
  }

  const handleScrubbingChange = useCallback((scrubbing: boolean) => {
    setIsScrubbing(scrubbing)
    // При скраббинге мы больше не меняем muted, просто отслеживаем состояние
  }, [])

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col">
      {/* Main Layout */}
      <div className="flex-1 flex">
        {/* Left Panel - Media Library */}
        <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
          {/* Import Button */}
          <div className="p-3 border-b border-gray-800">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Uploading...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">Import Media</span>
                </>
              )}
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Media Files List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {mediaFiles.map((file) => (
              <button
                key={file.id}
                onClick={() => handleFileSelect(file)}
                className={`w-full flex items-start gap-2 p-2 rounded transition-all text-left ${
                  selectedFile?.id === file.id 
                    ? 'bg-gray-800 border border-yellow-400/50' 
                    : 'hover:bg-gray-800/50'
                }`}
              >
                {/* Thumbnail or Icon */}
                <div className="w-12 h-8 rounded overflow-hidden bg-gray-700 flex-shrink-0">
                  {file.thumbnail ? (
                    <img
                      src={file.thumbnail}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {file.type === 'video' ? (
                        <FileVideo className="h-4 w-4 text-gray-500" />
                      ) : (
                        <FileAudio className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                  )}
                </div>
                
                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-200 truncate">{file.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span>{formatTime(file.duration)}</span>
                    {file.transcriptStatus === 'completed' && (
                      <span className="text-green-400">📝</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            
            {mediaFiles.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <div className="text-3xl mb-2">📁</div>
                <p className="text-xs">No media files</p>
                <p className="text-xs">Click Import to add</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Video Player */}
        <div className="flex-1 bg-black flex flex-col">
          {selectedFile ? (
            <>
              {/* Video/Audio Player */}
              <div className="flex-1 relative">
                <MediaPlayer
                  ref={mediaPlayerRef}
                  src={getMediaUrl(selectedFile)}
                  type={selectedFile.type}
                  onTimeUpdate={handleTimeUpdate}
                  onSeek={handleSeek}
                  onPlayStateChange={handlePlayStateChange}
                  transcript={transcript?.segments}
                  className="h-full"
                  muted={false}
                />
              </div>
              
              {/* Player Controls Bar */}
              <div className="h-12 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlayPause}
                    className="p-1.5 hover:bg-gray-800 rounded transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                  
                  {/* Time Display */}
                  <span className="text-sm text-gray-400">
                    {formatTime(currentTime)} / {formatTime(selectedFile.duration)}
                  </span>
                </div>
                
                {/* Transcribe Button */}
                <button
                  onClick={handleTranscribe}
                  disabled={isTranscribing || selectedFile.transcriptStatus === 'completed'}
                  className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${
                    selectedFile.transcriptStatus === 'completed'
                      ? 'bg-green-900/30 text-green-400 cursor-default'
                      : isTranscribing
                      ? 'bg-yellow-900/30 text-yellow-400'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Transcribing...</span>
                    </>
                  ) : selectedFile.transcriptStatus === 'completed' ? (
                    <>
                      <span className="text-xs">✓ Transcribed</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3 w-3" />
                      <span className="text-xs">Transcribe</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-4xl mb-2">🎬</div>
                <p>Select a media file to begin</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel - Timeline */}
      <div className="h-[35vh] border-t border-gray-800">
        {selectedFile ? (
          <TimelineWrapper
            mediaFile={selectedFile}
            transcript={transcript}
            currentTime={currentTime}
            onTimeUpdate={handleSeek}
            isPlaying={isPlaying}
            onPlayPause={togglePlayPause}
            onScrubbingChange={handleScrubbingChange}
            className="h-full"
          />
        ) : (
          <div className="h-full bg-gray-900 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-3xl mb-2">✂️</div>
              <p className="text-sm">Timeline will appear here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}