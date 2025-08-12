'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, File, X, AlertCircle, Link } from 'lucide-react'
import { cn, formatFileSize, getMediaType } from '@/lib/utils'

interface UploadProgress {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
}

interface MediaUploadProps {
  onFilesUploaded: (files: File[]) => void
  onUrlImport: (url: string) => void
  maxFileSize?: number // in bytes, default 5GB
  acceptedFormats?: string[]
  className?: string
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
  onFilesUploaded,
  onUrlImport,
  maxFileSize = 5 * 1024 * 1024 * 1024, // 5GB
  acceptedFormats = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'],
  className
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<UploadProgress[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [isUrlImporting, setIsUrlImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [completedUploads, setCompletedUploads] = useState<File[]>([])

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (file.size > maxFileSize) {
      return { valid: false, error: `File size exceeds ${formatFileSize(maxFileSize)} limit` }
    }
    
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!acceptedFormats.includes(fileExt)) {
      return { valid: false, error: 'Unsupported file format' }
    }
    
    return { valid: true }
  }

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const validFiles: File[] = []
    const newUploads: UploadProgress[] = []

    fileArray.forEach((file) => {
      const validation = validateFile(file)
      const id = Math.random().toString(36).substr(2, 9)
      
      if (validation.valid) {
        validFiles.push(file)
        newUploads.push({
          id,
          file,
          progress: 0,
          status: 'uploading'
        })
      } else {
        newUploads.push({
          id,
          file,
          progress: 0,
          status: 'error',
          error: validation.error
        })
      }
    })

    setUploadQueue(prev => [...prev, ...newUploads])

    // Upload valid files to server
    for (const file of validFiles) {
      const uploadItem = newUploads.find(u => u.file === file)
      if (!uploadItem) continue
      
      try {
        // Create FormData
        const formData = new FormData()
        formData.append('file', file)
        
        // Upload with progress tracking
        const xhr = new XMLHttpRequest()
        
        // Track progress
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100
            setUploadQueue(prev => prev.map(u => 
              u.id === uploadItem.id 
                ? { ...u, progress, status: progress === 100 ? 'processing' : 'uploading' }
                : u
            ))
          }
        }
        
        // Handle completion
        xhr.onload = () => {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText)
            setUploadQueue(prev => prev.map(u => 
              u.id === uploadItem.id 
                ? { ...u, progress: 100, status: 'completed' }
                : u
            ))
            console.log('Upload successful:', response)
          } else {
            setUploadQueue(prev => prev.map(u => 
              u.id === uploadItem.id 
                ? { ...u, status: 'error', error: 'Upload failed' }
                : u
            ))
          }
        }
        
        // Handle errors
        xhr.onerror = () => {
          setUploadQueue(prev => prev.map(u => 
            u.id === uploadItem.id 
              ? { ...u, status: 'error', error: 'Network error' }
              : u
          ))
        }
        
        // Send request
        xhr.open('POST', '/api/media/upload')
        xhr.send(formData)
        
      } catch (error) {
        console.error('Upload error:', error)
        setUploadQueue(prev => prev.map(u => 
          u.id === uploadItem.id 
            ? { ...u, status: 'error', error: 'Upload failed' }
            : u
        ))
      }
    }

  }, [maxFileSize, acceptedFormats])

  // Monitor upload queue for completion
  useEffect(() => {
    if (uploadQueue.length > 0) {
      const allComplete = uploadQueue.every(u => u.status === 'completed' || u.status === 'error')
      if (allComplete) {
        const successfulUploads = uploadQueue.filter(u => u.status === 'completed')
        if (successfulUploads.length > 0 && completedUploads.length === 0) {
          const files = successfulUploads.map(u => u.file)
          setCompletedUploads(files)
          onFilesUploaded(files)
          // Clear the queue after a delay
          setTimeout(() => {
            setUploadQueue([])
            setCompletedUploads([])
          }, 2000)
        }
      }
    }
  }, [uploadQueue, completedUploads, onFilesUploaded])

  // Removed simulateUpload - now using real uploads

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFiles(files)
    }
  }, [processFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFiles(files)
    }
  }, [processFiles])

  const handleUrlImport = async () => {
    if (!urlInput.trim()) return
    
    setIsUrlImporting(true)
    try {
      await onUrlImport(urlInput.trim())
      setUrlInput('')
    } catch (error) {
      console.error('URL import failed:', error)
    } finally {
      setIsUrlImporting(false)
    }
  }

  const removeUpload = (id: string) => {
    setUploadQueue(prev => prev.filter(upload => upload.id !== id))
  }

  const getMediaIcon = (fileName: string) => {
    const mediaType = getMediaType({ name: fileName } as File)
    return mediaType === 'video' ? '🎬' : mediaType === 'audio' ? '🎵' : '📄'
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* File Drop Zone */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          "hover:border-blue-400 hover:bg-blue-50/5",
          isDragOver ? "border-blue-400 bg-blue-50/10" : "border-gray-600",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        aria-label="Upload media files"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedFormats.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
        />
        
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-200 mb-2">
          Drag files here or click to browse
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Supports: {acceptedFormats.slice(0, 3).join(', ')}... | Max size: {formatFileSize(maxFileSize)}
        </p>
      </div>

      {/* URL Import Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Link className="h-4 w-4" />
          <span>Import from URL</span>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="YouTube, Vimeo, Podcast URLs supported"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isUrlImporting}
          />
          <button
            onClick={handleUrlImport}
            disabled={!urlInput.trim() || isUrlImporting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            {isUrlImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          YouTube, Vimeo, Podcast URLs supported
        </p>
      </div>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Upload Progress</h4>
          {uploadQueue.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700"
            >
              <div className="flex-shrink-0 text-lg">
                {upload.status === 'error' ? '❌' : getMediaIcon(upload.file.name)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-200 truncate">
                    {upload.file.name}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {formatFileSize(upload.file.size)}
                  </span>
                </div>
                
                {upload.status === 'error' ? (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    {upload.error}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">
                        {upload.status === 'completed' ? 'Completed' : 
                         upload.status === 'processing' ? 'Processing...' : 'Uploading...'}
                      </span>
                      {upload.status !== 'completed' && (
                        <span className="text-gray-400">{Math.round(upload.progress)}%</span>
                      )}
                    </div>
                    {upload.status !== 'completed' && (
                      <div className="w-full bg-gray-700 rounded-full h-1">
                        <div
                          className={cn(
                            "h-1 rounded-full transition-all duration-300",
                            upload.status === 'processing' ? "bg-yellow-500" : "bg-blue-500"
                          )}
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <button
                onClick={() => removeUpload(upload.id)}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-200 rounded"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MediaUpload