'use client'

import React, { useState, useMemo } from 'react'
import { 
  Search, 
  Filter, 
  Grid3X3, 
  List, 
  MoreVertical,
  Edit,
  Trash2,
  Download,
  Clock,
  FileVideo,
  FileAudio,
  CheckCircle,
  AlertCircle,
  Loader,
  X
} from 'lucide-react'
import { cn, formatTime, formatFileSize } from '@/lib/utils'

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
  tags?: string[]
  metadata?: {
    resolution?: string
    bitrate?: number
    codec?: string
    fps?: number
  }
}

interface MediaLibraryProps {
  files: MediaFile[]
  onFileSelect?: (file: MediaFile) => void
  onFileDelete?: (fileId: string) => void
  onFileEdit?: (fileId: string) => void
  onBatchOperation?: (fileIds: string[], operation: string) => void
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (mode: 'grid' | 'list') => void
  className?: string
}

type SortOption = 'name' | 'date' | 'size' | 'duration' | 'status'
type FilterOption = 'all' | 'video' | 'audio' | 'ready' | 'processing' | 'transcribed' | 'highlights'

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  files,
  onFileSelect,
  onFileDelete,
  onFileEdit,
  onBatchOperation,
  viewMode = 'grid',
  onViewModeChange,
  className
}) => {
  console.log('MediaLibrary received files:', files)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null)

  // Filter and sort files
  const filteredAndSortedFiles = useMemo(() => {
    let filtered = files

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    }

    // Apply type/status filter
    switch (filterBy) {
      case 'video':
        filtered = filtered.filter(file => file.type === 'video')
        break
      case 'audio':
        filtered = filtered.filter(file => file.type === 'audio')
        break
      case 'ready':
        filtered = filtered.filter(file => file.status === 'ready')
        break
      case 'processing':
        filtered = filtered.filter(file => 
          file.status === 'processing' || 
          file.transcriptStatus === 'processing' ||
          file.highlightsStatus === 'processing'
        )
        break
      case 'transcribed':
        filtered = filtered.filter(file => file.transcriptStatus === 'completed')
        break
      case 'highlights':
        filtered = filtered.filter(file => file.highlightsStatus === 'completed')
        break
    }

    // Sort files
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'date':
          comparison = a.createdAt.getTime() - b.createdAt.getTime()
          break
        case 'size':
          comparison = a.size - b.size
          break
        case 'duration':
          comparison = a.duration - b.duration
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [files, searchTerm, sortBy, sortOrder, filterBy])

  const handleFileClick = (file: MediaFile) => {
    // Set as selected file to show action bar
    setSelectedFile(file)
  }


  const getStatusIcon = (file: MediaFile) => {
    switch (file.status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'processing':
        return <Loader className="h-4 w-4 text-yellow-400 animate-spin" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-400" />
      case 'transcribing':
        return <Loader className="h-4 w-4 text-blue-400 animate-spin" />
      default:
        return null
    }
  }

  const getStatusBadges = (file: MediaFile) => {
    const badges = []
    
    if (file.transcriptStatus === 'completed') {
      badges.push('📝')
    }
    if (file.highlightsStatus === 'completed') {
      badges.push('✨')
    }
    if (file.editStatus === 'completed' || file.editStatus === 'draft') {
      badges.push('🎬')
    }
    
    return badges.join(' ')
  }

  const getFileIcon = (file: MediaFile) => {
    return file.type === 'video' ? (
      <FileVideo className="h-8 w-8 text-blue-400" />
    ) : (
      <FileAudio className="h-8 w-8 text-green-400" />
    )
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 7) return `${diffInDays} days ago`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`
    return `${Math.floor(diffInDays / 365)} years ago`
  }

  return (
    <div className={cn("bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        {/* Search and Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as FilterOption)}
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="ready">Ready</option>
              <option value="processing">Processing</option>
              <option value="transcribed">Transcribed</option>
              <option value="highlights">Has Highlights</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [sort, order] = e.target.value.split('-')
                setSortBy(sort as SortOption)
                setSortOrder(order as 'asc' | 'desc')
              }}
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="size-desc">Largest First</option>
              <option value="size-asc">Smallest First</option>
              <option value="duration-desc">Longest First</option>
              <option value="duration-asc">Shortest First</option>
            </select>

            {/* View Mode Toggle */}
            {onViewModeChange && (
              <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
                <button
                  onClick={() => onViewModeChange('grid')}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === 'grid' ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                  aria-label="Grid view"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onViewModeChange('list')}
                  className={cn(
                    "p-2 transition-colors border-l border-gray-300 dark:border-gray-600",
                    viewMode === 'list' ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Selected File Action Bar */}
      {selectedFile && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {selectedFile.type === 'video' ? (
                <FileVideo className="h-5 w-5 text-blue-400" />
              ) : (
                <FileAudio className="h-5 w-5 text-green-400" />
              )}
              <span className="font-medium text-gray-900 dark:text-gray-200">{selectedFile.name}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">({formatTime(selectedFile.duration)})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onFileEdit?.(selectedFile.id)
                setSelectedFile(null)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              <Edit className="h-4 w-4" />
              Studio
            </button>
            <button
              onClick={() => {
                onFileDelete?.(selectedFile.id)
                setSelectedFile(null)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
            <button
              onClick={() => setSelectedFile(null)}
              className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {filteredAndSortedFiles.length === 0 ? (
          /* Empty State */
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📁</div>
            <h4 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
              {searchTerm || filterBy !== 'all' ? 'No files found' : 'No media files'}
            </h4>
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || filterBy !== 'all' 
                ? 'Try adjusting your search or filter criteria'
                : 'Drag and drop files above to get started'
              }
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {filteredAndSortedFiles.map((file) => {
              
              return (
                <div
                  key={file.id}
                  className={cn(
                    "group relative bg-white dark:bg-gray-800 border-2 rounded-lg overflow-hidden cursor-pointer transition-all hover:border-gray-400 dark:hover:border-gray-500",
                    selectedFile?.id === file.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-300 dark:border-gray-600"
                  )}
                  onClick={() => handleFileClick(file)}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gray-700 flex items-center justify-center relative">
                    {file.thumbnail ? (
                      <img
                        src={file.thumbnail}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getFileIcon(file)
                    )}
                    
                    {/* Duration Badge */}
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                      {formatTime(file.duration)}
                    </div>
                    
                    {/* Status Icon */}
                    <div className="absolute top-2 left-2">
                      {getStatusIcon(file)}
                    </div>

                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-200 text-sm truncate mb-1">
                      {file.name}
                    </h4>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatDate(file.createdAt)}</span>
                      <span>{getStatusBadges(file)}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {filteredAndSortedFiles.map((file) => {
              
              return (
                <div
                  key={file.id}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-all hover:border-gray-400 dark:hover:border-gray-500",
                    selectedFile?.id === file.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                  )}
                  onClick={() => handleFileClick(file)}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {getFileIcon(file)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-200 truncate">
                        {file.name}
                      </h4>
                      <span className="text-sm">{getStatusBadges(file)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>{formatTime(file.duration)}</span>
                      <span>{formatFileSize(file.size)}</span>
                      <span>{formatDate(file.createdAt)}</span>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(file)}
                        {file.status}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onFileEdit?.(file.id)
                      }}
                      className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                      aria-label="Edit file"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onFileDelete?.(file.id)
                      }}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                      aria-label="Delete file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex justify-between items-center">
          <span>
            {filteredAndSortedFiles.length} of {files.length} files
            {searchTerm && ` matching "${searchTerm}"`}
          </span>
          <div className="flex items-center gap-4">
            <span>
              Total: {formatFileSize(files.reduce((acc, file) => acc + file.size, 0))}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MediaLibrary