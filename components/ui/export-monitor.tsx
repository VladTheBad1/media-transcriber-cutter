'use client'

import React from 'react'
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Download,
  Loader2,
  RotateCcw,
  X,
  Pause,
  Play,
  Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFileSize, formatDuration } from '@/lib/export'
import { useExport } from '@/lib/hooks/use-export'

interface ExportMonitorProps {
  className?: string
  showCompleted?: boolean
  showFailed?: boolean
  maxItems?: number
}

export const ExportMonitor: React.FC<ExportMonitorProps> = ({
  className,
  showCompleted = true,
  showFailed = true,
  maxItems = 10
}) => {
  const {
    currentJobs,
    queueStats,
    isLoading,
    cancelJob,
    retryJob,
    pauseQueue,
    resumeQueue,
    clearQueue,
    getActiveJobs,
    getCompletedJobs,
    getFailedJobs,
    isQueueBusy
  } = useExport()

  const activeJobs = getActiveJobs()
  const completedJobs = getCompletedJobs()
  const failedJobs = getFailedJobs()

  const filteredJobs = [
    ...activeJobs,
    ...(showCompleted ? completedJobs : []),
    ...(showFailed ? failedJobs : [])
  ].slice(0, maxItems)

  const getStatusIcon = (status: string, isAnimated = true) => {
    switch (status) {
      case 'processing':
        return isAnimated ? 
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> :
          <div className="h-4 w-4 bg-blue-500 rounded-full animate-pulse" />
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'cancelled':
        return <X className="h-4 w-4 text-gray-500" />
      default:
        return <div className="h-4 w-4 bg-gray-500 rounded-full" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'bg-blue-600 text-white'
      case 'queued':
        return 'bg-yellow-600 text-white'
      case 'completed':
        return 'bg-green-600 text-white'
      case 'failed':
        return 'bg-red-600 text-white'
      case 'cancelled':
        return 'bg-gray-600 text-white'
      default:
        return 'bg-gray-600 text-white'
    }
  }

  const handleCancelJob = async (jobId: string) => {
    await cancelJob(jobId)
  }

  const handleRetryJob = async (jobId: string) => {
    await retryJob(jobId)
  }

  const handleQueueAction = async (action: 'pause' | 'resume' | 'clear') => {
    switch (action) {
      case 'pause':
        await pauseQueue()
        break
      case 'resume':
        await resumeQueue()
        break
      case 'clear':
        if (confirm('Are you sure you want to clear all queued exports?')) {
          await clearQueue()
        }
        break
    }
  }

  if (currentJobs.length === 0 && !isLoading) {
    return (
      <div className={cn(
        "bg-gray-900 rounded-lg border border-gray-700 p-6",
        className
      )}>
        <div className="text-center text-gray-400">
          <Download className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No export jobs found</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      "bg-gray-900 rounded-lg border border-gray-700",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Monitor
            </h3>
            {queueStats && (
              <p className="text-sm text-gray-400 mt-1">
                {queueStats.processingJobs} processing, {queueStats.queuedJobs} queued, {queueStats.completedJobs} completed
              </p>
            )}
          </div>

          {/* Queue Controls */}
          <div className="flex items-center gap-2">
            {isQueueBusy() ? (
              <button
                onClick={() => handleQueueAction('pause')}
                className="p-2 hover:bg-gray-700 rounded-md transition-colors"
                title="Pause queue"
              >
                <Pause className="h-4 w-4 text-gray-400" />
              </button>
            ) : (
              <button
                onClick={() => handleQueueAction('resume')}
                className="p-2 hover:bg-gray-700 rounded-md transition-colors"
                title="Resume queue"
              >
                <Play className="h-4 w-4 text-gray-400" />
              </button>
            )}
            
            <button
              onClick={() => handleQueueAction('clear')}
              className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              title="Clear queue"
            >
              <Trash2 className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Jobs List */}
      <div className="p-4">
        {isLoading && currentJobs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-400">Loading export jobs...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => (
              <div 
                key={job.id} 
                className="bg-gray-800 rounded-lg p-4 border border-gray-600 hover:border-gray-500 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">
                          Job {job.id.slice(-8)}
                        </span>
                        <span className={cn(
                          "text-xs px-2 py-1 rounded-full",
                          getStatusColor(job.status)
                        )}>
                          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Created at {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {/* Job Actions */}
                  <div className="flex items-center gap-2">
                    {job.status === 'failed' && (
                      <button
                        onClick={() => handleRetryJob(job.id)}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                        title="Retry job"
                      >
                        <RotateCcw className="h-4 w-4 text-gray-400 hover:text-white" />
                      </button>
                    )}
                    
                    {(job.status === 'queued' || job.status === 'processing') && (
                      <button
                        onClick={() => handleCancelJob(job.id)}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                        title="Cancel job"
                      >
                        <X className="h-4 w-4 text-gray-400 hover:text-red-400" />
                      </button>
                    )}

                    {job.status === 'completed' && job.result && (
                      <div className="text-xs text-gray-400">
                        {formatFileSize(job.result.fileSize)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {job.status === 'processing' && (
                  <div className="space-y-2">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{Math.round(job.progress)}% complete</span>
                      {job.estimatedTimeRemaining && (
                        <span>{formatDuration(job.estimatedTimeRemaining)} remaining</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {job.error && (
                  <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded text-xs text-red-300">
                    {job.error}
                  </div>
                )}

                {/* Job Result */}
                {job.status === 'completed' && job.result && (
                  <div className="mt-2 p-2 bg-green-900/30 border border-green-500/50 rounded text-xs text-green-300">
                    <div className="flex justify-between">
                      <span>Export completed successfully</span>
                      <span>{formatDuration(job.result.duration)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {filteredJobs.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No export jobs to display</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Queue Statistics */}
      {queueStats && (
        <div className="p-4 border-t border-gray-700 bg-gray-800/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-gray-400">Total</div>
              <div className="text-lg font-semibold text-gray-200">
                {queueStats.totalJobs}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Processing</div>
              <div className="text-lg font-semibold text-blue-400">
                {queueStats.processingJobs}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Queued</div>
              <div className="text-lg font-semibold text-yellow-400">
                {queueStats.queuedJobs}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Completed</div>
              <div className="text-lg font-semibold text-green-400">
                {queueStats.completedJobs}
              </div>
            </div>
          </div>

          {queueStats.averageProcessingTime > 0 && (
            <div className="mt-3 text-center text-xs text-gray-400">
              Average processing time: {formatDuration(queueStats.averageProcessingTime)}
              {queueStats.estimatedTimeRemaining > 0 && (
                <> • Estimated time remaining: {formatDuration(queueStats.estimatedTimeRemaining)}</>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ExportMonitor