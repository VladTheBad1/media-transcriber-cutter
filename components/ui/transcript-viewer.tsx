'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Download, Edit2, Users, Clock, AlertCircle } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'

interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
  speaker?: string
  confidence?: number
  isEditing?: boolean
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[]
  currentTime?: number
  onSegmentClick?: (segment: TranscriptSegment) => void
  onSegmentEdit?: (segmentId: string, newText: string) => void
  onSpeakerEdit?: (segmentId: string, newSpeaker: string) => void
  onExport?: (format: 'srt' | 'vtt' | 'txt' | 'json') => void
  className?: string
  showConfidence?: boolean
  showTimestamps?: boolean
  editable?: boolean
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  segments,
  currentTime,
  onSegmentClick,
  onSegmentEdit,
  onSpeakerEdit,
  onExport,
  className,
  showConfidence = true,
  showTimestamps = true,
  editable = true
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [editingSegment, setEditingSegment] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [editingSpeaker, setEditingSpeaker] = useState('')
  const [highlightedSegments, setHighlightedSegments] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const activeSegmentRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to current segment
  useEffect(() => {
    if (currentTime !== undefined && activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [currentTime])

  // Filter segments based on search
  const filteredSegments = segments.filter(segment =>
    segment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (segment.speaker && segment.speaker.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Highlight search results
  useEffect(() => {
    if (searchTerm) {
      const matchingIds = segments
        .filter(segment => 
          segment.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (segment.speaker && segment.speaker.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .map(segment => segment.id)
      setHighlightedSegments(matchingIds)
    } else {
      setHighlightedSegments([])
    }
  }, [searchTerm, segments])

  const getCurrentSegment = () => {
    if (currentTime === undefined) return null
    return segments.find(segment =>
      currentTime >= segment.start && currentTime <= segment.end
    )
  }

  const handleSegmentClick = (segment: TranscriptSegment) => {
    if (editingSegment) return // Don't navigate while editing
    onSegmentClick?.(segment)
  }

  const startEditing = (segment: TranscriptSegment, type: 'text' | 'speaker') => {
    setEditingSegment(segment.id)
    if (type === 'text') {
      setEditingText(segment.text)
    } else {
      setEditingSpeaker(segment.speaker || '')
    }
  }

  const saveEdit = () => {
    if (!editingSegment) return
    
    const segment = segments.find(s => s.id === editingSegment)
    if (!segment) return

    if (editingText !== segment.text) {
      onSegmentEdit?.(editingSegment, editingText)
    }
    
    if (editingSpeaker !== segment.speaker) {
      onSpeakerEdit?.(editingSegment, editingSpeaker)
    }

    cancelEdit()
  }

  const cancelEdit = () => {
    setEditingSegment(null)
    setEditingText('')
    setEditingSpeaker('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-400'
    if (confidence >= 0.9) return 'text-green-400'
    if (confidence >= 0.7) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getConfidenceStars = (confidence?: number) => {
    if (!confidence) return '⭐'
    if (confidence >= 0.9) return '⭐⭐⭐⭐⭐'
    if (confidence >= 0.8) return '⭐⭐⭐⭐'
    if (confidence >= 0.7) return '⭐⭐⭐'
    if (confidence >= 0.6) return '⭐⭐'
    return '⭐'
  }

  const highlightSearchTerm = (text: string, term: string) => {
    if (!term) return text
    
    const regex = new RegExp(`(${term})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-400 text-black px-1 rounded">
          {part}
        </mark>
      ) : part
    )
  }

  const currentSegment = getCurrentSegment()

  return (
    <div className={cn("bg-gray-900 rounded-lg border border-gray-700", className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Transcript
          </h3>
          <div className="flex items-center gap-2">
            {onExport && (
              <div className="relative group">
                <button className="p-2 text-gray-400 hover:text-gray-200 transition-colors">
                  <Download className="h-4 w-4" />
                </button>
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <div className="p-1 space-y-1">
                    <button
                      onClick={() => onExport('srt')}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
                    >
                      Export SRT
                    </button>
                    <button
                      onClick={() => onExport('vtt')}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
                    >
                      Export VTT
                    </button>
                    <button
                      onClick={() => onExport('txt')}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
                    >
                      Export Text
                    </button>
                    <button
                      onClick={() => onExport('json')}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search transcript..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Transcript Content */}
      <div
        ref={containerRef}
        className="max-h-96 overflow-y-auto p-4 space-y-3"
      >
        {filteredSegments.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {searchTerm ? (
              <div>
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No results found for &ldquo;{searchTerm}&rdquo;</p>
              </div>
            ) : (
              <div>
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No transcript available</p>
              </div>
            )}
          </div>
        ) : (
          filteredSegments.map((segment) => {
            const isCurrentSegment = currentSegment?.id === segment.id
            const isHighlighted = highlightedSegments.includes(segment.id)
            const isEditing = editingSegment === segment.id

            return (
              <div
                key={segment.id}
                ref={isCurrentSegment ? activeSegmentRef : null}
                className={cn(
                  "p-3 rounded-lg border transition-all cursor-pointer",
                  isCurrentSegment
                    ? "bg-blue-900/30 border-blue-500"
                    : isHighlighted
                    ? "bg-yellow-900/20 border-yellow-500"
                    : "bg-gray-800 border-gray-600 hover:border-gray-500",
                  isEditing && "ring-2 ring-blue-500"
                )}
                onClick={() => !isEditing && handleSegmentClick(segment)}
              >
                {/* Speaker and Timestamp */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {segment.speaker && (
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingSpeaker}
                            onChange={(e) => setEditingSpeaker(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-sm text-blue-400 font-medium min-w-0 flex-1"
                            placeholder="Speaker name"
                          />
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (editable) startEditing(segment, 'speaker')
                            }}
                            className={cn(
                              "text-sm font-medium px-2 py-1 rounded",
                              editable ? "hover:bg-gray-700" : "",
                              "text-blue-400"
                            )}
                          >
                            🎤 {segment.speaker}
                          </button>
                        )}
                      </div>
                    )}
                    
                    {showTimestamps && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        [{formatTime(segment.start)}]
                      </span>
                    )}
                    
                    {showConfidence && segment.confidence && (
                      <div className={cn(
                        "text-xs flex items-center gap-1",
                        getConfidenceColor(segment.confidence)
                      )}>
                        <AlertCircle className="h-3 w-3" />
                        {getConfidenceStars(segment.confidence)}
                      </div>
                    )}
                  </div>

                  {editable && !isEditing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startEditing(segment, 'text')
                      }}
                      className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                      aria-label="Edit segment"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Text Content */}
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full bg-gray-700 border border-gray-500 rounded p-2 text-gray-200 resize-none"
                      rows={3}
                      placeholder="Transcript text"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-200 leading-relaxed">
                    {searchTerm ? highlightSearchTerm(segment.text, searchTerm) : segment.text}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer Stats */}
      {segments.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>
              {filteredSegments.length} of {segments.length} segments
              {searchTerm && ` matching "${searchTerm}"`}
            </span>
            <span>
              Duration: {formatTime(Math.max(...segments.map(s => s.end)))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default TranscriptViewer