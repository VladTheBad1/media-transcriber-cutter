"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { TimelineEditor } from "./timeline-editor";
import {
  TimelineOperations,
  createTimelineOperations,
  type TimelineClip,
} from "@/lib/timeline/operations";
import { formatTime } from "@/lib/utils";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { Button } from "./button";
import { Alert, AlertDescription } from "./alert";

interface MediaFile {
  mediaId: string;
  filename: string;
  originalName: string;
  title?: string | null;
  type: "video" | "audio";
  format: string;
  size: number;
  duration: number;
  resolution?: string;
  thumbnailUrl?: string;
  status: string;
  uploadedAt: string;
  hasTranscripts: boolean;
  hasTimelines: boolean;
  hasHighlights: boolean;
}

interface Transcript {
  id: string;
  mediaFileId: string;
  language: string;
  confidence: number;
  status: string;
  segments: TranscriptSegment[];
}

interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
  speaker?: {
    id: string;
    label: string;
    name?: string;
  };
}

interface TimelineWrapperProps {
  mediaFile: MediaFile;
  transcript?: Transcript | null;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSave?: (success: boolean) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  className?: string;
}

export const TimelineWrapper: React.FC<TimelineWrapperProps> = ({
  mediaFile,
  transcript,
  currentTime,
  onTimeUpdate,
  onSave,
  onScrubbingChange,
  isPlaying: externalIsPlaying,
  onPlayPause: externalOnPlayPause,
  className,
}) => {
  const [operations, setOperations] = useState<TimelineOperations | null>(null);
  const [timelineState, setTimelineState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Use external isPlaying if provided, otherwise use local state
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const isPlaying = externalIsPlaying !== undefined ? externalIsPlaying : localIsPlaying;
  const [playbackRate, setPlaybackRate] = useState(1);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [activeClips, setActiveClips] = useState<TimelineClip[]>([]);
  const [virtualTimeline, setVirtualTimeline] = useState<{ virtual: number; actual: number }[]>([]);
  const [virtualDuration, setVirtualDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const lastSaveTimeRef = useRef<number>(0);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
  const playbackMonitorRef = useRef<NodeJS.Timeout>();
  const lastActualTimeRef = useRef<number>(0);

  // Generate media URL for player
  const getMediaUrl = (media: MediaFile) => {
    // Use the actual filename (UUID) that exists on disk
    const filename = (media as any).filename || media.name;
    return `/api/media/stream/${filename}`;
  };

  // Get active clips from all visible tracks
  const getActiveClips = useCallback((state: any) => {
    if (!state?.tracks) return [];
    
    const clips: TimelineClip[] = [];
    state.tracks.forEach((track: any) => {
      if (track.visible && !track.muted) {
        clips.push(...track.clips);
      }
    });
    
    // Sort clips by start time
    return clips.sort((a, b) => a.start - b.start);
  }, []);

  // Build virtual timeline mapping (virtual time -> actual media time)
  const buildVirtualTimeline = useCallback((clips: TimelineClip[]) => {
    const mapping: { virtual: number; actual: number }[] = [];
    let virtualTime = 0;
    
    // Create mapping for each clip
    clips.forEach(clip => {
      const clipDuration = clip.end - clip.start;
      
      // Add start point
      mapping.push({ virtual: virtualTime, actual: clip.start });
      
      // Add end point
      virtualTime += clipDuration;
      mapping.push({ virtual: virtualTime, actual: clip.end });
    });
    
    return { mapping, totalDuration: virtualTime };
  }, []);

  // Convert virtual time to actual media time
  const virtualToActualTime = useCallback((virtualTime: number | undefined | null, mapping: { virtual: number; actual: number }[]) => {
    // Handle undefined or invalid virtualTime
    if (virtualTime === undefined || virtualTime === null || isNaN(virtualTime)) {
      return 0;
    }
    
    if (!mapping || mapping.length === 0) return virtualTime;
    
    // Find the segment this virtual time belongs to
    for (let i = 0; i < mapping.length - 1; i += 2) {
      const segmentStart = mapping[i];
      const segmentEnd = mapping[i + 1];
      
      if (segmentStart && segmentEnd && 
          virtualTime >= segmentStart.virtual && virtualTime <= segmentEnd.virtual) {
        // Calculate position within this segment
        const segmentProgress = (virtualTime - segmentStart.virtual) / (segmentEnd.virtual - segmentStart.virtual);
        const actualTime = segmentStart.actual + segmentProgress * (segmentEnd.actual - segmentStart.actual);
        return actualTime;
      }
    }
    
    // If beyond all clips, return the last actual time
    return mapping.length > 0 ? mapping[mapping.length - 1].actual : virtualTime;
  }, []);

  // Convert actual media time to virtual time
  const actualToVirtualTime = useCallback((actualTime: number, mapping: { virtual: number; actual: number }[], clips: TimelineClip[]) => {
    // Handle undefined or invalid actualTime
    if (actualTime === undefined || actualTime === null || isNaN(actualTime)) {
      return 0;
    }
    
    if (!mapping || mapping.length === 0) return actualTime;
    
    // Check if actual time is within any clip
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (actualTime >= clip.start && actualTime <= clip.end) {
        // Find corresponding virtual segment
        const segmentIndex = i * 2;
        const segmentStart = mapping[segmentIndex];
        const segmentEnd = mapping[segmentIndex + 1];
        
        // Calculate virtual time within this segment
        const clipProgress = (actualTime - clip.start) / (clip.end - clip.start);
        const virtualTime = segmentStart.virtual + clipProgress * (segmentEnd.virtual - segmentStart.virtual);
        return virtualTime;
      }
    }
    
    // If not in any clip, return 0 or nearest clip start
    return 0;
  }, []);

  // Check if actual time is in a cut section and get next valid clip start
  const getNextValidTime = useCallback((actualTime: number, clips: TimelineClip[]) => {
    if (clips.length === 0) return actualTime;
    
    // Sort clips by start time
    const sortedClips = [...clips].sort((a, b) => a.start - b.start);
    
    // Check if we're in a valid clip
    for (const clip of sortedClips) {
      if (actualTime >= clip.start && actualTime <= clip.end) {
        return actualTime; // We're in a valid clip
      }
    }
    
    // We're in a cut section, find the next clip
    for (const clip of sortedClips) {
      if (clip.start > actualTime) {
        return clip.start; // Jump to the start of the next clip
      }
    }
    
    // No more clips, pause at the end
    return -1;
  }, []);

  // Initialize timeline operations
  useEffect(() => {
    const initializeTimeline = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const timelineOps = createTimelineOperations();
        await timelineOps.initializeFromMedia(mediaFile.mediaId, transcript, mediaFile.duration);

        // Subscribe to state changes
        const unsubscribe = timelineOps.subscribe((state) => {
          setTimelineState(state);
          setHasUnsavedChanges(true);
          
          // Update active clips and virtual timeline when timeline changes
          const clips = getActiveClips(state);
          setActiveClips(clips);
          
          // Build virtual timeline mapping
          const { mapping, totalDuration } = buildVirtualTimeline(clips);
          setVirtualTimeline(mapping);
          setVirtualDuration(totalDuration);
          
          // Removed verbose logging for cleaner output
          // console.log('🔄 Timeline state updated:', {
          //   activeClips: clips.length,
          //   virtualDuration: totalDuration.toFixed(2),
          //   mappingPoints: mapping.length,
          //   firstClip: clips[0] ? `${clips[0].start.toFixed(2)}-${clips[0].end.toFixed(2)}` : 'none'
          // });

          // Auto-save after 2 seconds of inactivity
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }

          autoSaveTimeoutRef.current = setTimeout(() => {
            handleAutoSave(timelineOps);
          }, 2000);
        });

        setOperations(timelineOps);
        setTimelineState(timelineOps.getState());
        setIsLoading(false);

        return () => {
          unsubscribe();
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }
        };
      } catch (err) {
        console.error("Failed to initialize timeline:", err);
        setError(
          "Failed to initialize timeline. Please try refreshing the page.",
        );
        setIsLoading(false);
      }
    };

    initializeTimeline();
  }, [mediaFile.mediaId, transcript]);

  // Auto-save handler
  const handleAutoSave = useCallback(async (ops: TimelineOperations) => {
    const now = Date.now();
    if (now - lastSaveTimeRef.current < 1000) return; // Debounce

    lastSaveTimeRef.current = now;

    try {
      await ops.saveTimeline();
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  }, []);

  // Manual save handler
  const handleManualSave = useCallback(async () => {
    if (!operations || isSaving) return;

    setIsSaving(true);
    try {
      await operations.saveTimeline();
      setHasUnsavedChanges(false);
      onSave?.(true);
    } catch (err) {
      console.error("Manual save failed:", err);
      onSave?.(false);
      setError("Failed to save timeline. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [operations, isSaving, onSave]);

  // Timeline editor event handlers
  const handleTimeChange = useCallback(
    (time: number) => {
      // Prevent infinite recursion - check if we're already at this time
      if (Math.abs(localCurrentTime - time) < 0.01) {
        return;
      }
      
      operations?.setCurrentTime(time);
      onTimeUpdate(time);
      setLocalCurrentTime(time);
    },
    [operations, onTimeUpdate, localCurrentTime, mediaFile.duration],
  );

  const handlePlayPause = useCallback(() => {
    // Always use external onPlayPause since we removed the hidden player
    if (externalOnPlayPause) {
      externalOnPlayPause();
    }
    // No fallback needed - parent handles all playback control
  }, [externalOnPlayPause]);

  // Handle scrubbing state changes from timeline
  const handleScrubbingChange = useCallback((scrubbing: boolean) => {
    setIsScrubbing(scrubbing);
    // Pass scrubbing state to parent if callback provided
    if (onScrubbingChange) {
      onScrubbingChange(scrubbing);
    }
  }, [onScrubbingChange]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
  }, []);

  const handleClipEdit = useCallback(
    (trackId: string, clipId: string, updates: any) => {
      operations?.editClip(trackId, clipId, updates);
    },
    [operations],
  );

  const handleClipDelete = useCallback(
    (trackId: string, clipId: string) => {
      operations?.deleteClip(trackId, clipId);
    },
    [operations],
  );

  const handleClipSplit = useCallback(
    (trackId: string, clipId: string, splitTime: number) => {
      operations?.splitClip(trackId, clipId, splitTime);
    },
    [operations],
  );

  const handleClipMerge = useCallback(
    (trackId: string, clipId1: string, clipId2: string) => {
      operations?.mergeClips(trackId, clipId1, clipId2);
    },
    [operations],
  );

  const handleClipCopy = useCallback(
    (trackId: string, clipId: string) => {
      operations?.copyClip(trackId, clipId);
    },
    [operations],
  );

  const handleTrackToggle = useCallback(
    (trackId: string, property: "visible" | "muted" | "locked") => {
      operations?.toggleTrack(trackId, property);
    },
    [operations],
  );

  const handleUndo = useCallback(() => {
    const success = operations?.undo();
    if (!success) {
      console.log("Nothing to undo");
    }
  }, [operations]);

  const handleRedo = useCallback(() => {
    const success = operations?.redo();
    if (!success) {
      console.log("Nothing to redo");
    }
  }, [operations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleManualSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleManualSave]);

  // Update timeline current time from external source
  useEffect(() => {
    if (
      operations &&
      timelineState &&
      Math.abs(timelineState.currentTime - currentTime) > 0.1
    ) {
      operations.setCurrentTime(currentTime);
    }
    // Also update localCurrentTime to sync with external playback
    setLocalCurrentTime(currentTime);
  }, [currentTime, operations, timelineState]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 bg-gray-900 rounded-lg border border-gray-700">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading timeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="bg-red-900/20 border-red-600 text-red-200">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!operations || !timelineState) {
    return (
      <div className="flex items-center justify-center p-12 bg-gray-900 rounded-lg border border-gray-700">
        <div className="text-gray-400">Failed to initialize timeline</div>
      </div>
    );
  }

  const statistics = operations.getStatistics();

  return (
    <div className={className}>
      {/* REMOVED: Hidden MediaPlayer - was causing audio conflicts */}

      {/* Removed header for minimal interface */}

      {/* Timeline Editor */}
      <TimelineEditor
        tracks={timelineState.tracks}
        duration={timelineState.duration} // Always use full media duration
        currentTime={localCurrentTime}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        onTimeChange={handleTimeChange}
        onPlayPause={handlePlayPause}
        onPlaybackRateChange={handlePlaybackRateChange}
        onClipEdit={handleClipEdit}
        onClipDelete={handleClipDelete}
        onClipSplit={handleClipSplit}
        onClipMerge={handleClipMerge}
        onClipCopy={handleClipCopy}
        onTrackToggle={handleTrackToggle}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onScrubbingChange={handleScrubbingChange}
        className="min-h-[400px]"
        pixelsPerSecond={20}
        snapToGrid={true}
        gridInterval={1}
        showWaveforms={true}
        frameRate={30}
        mediaSrc={mediaFile.type === 'video' ? getMediaUrl(mediaFile) : undefined}
      />

      {/* Removed footer for minimal interface */}

    </div>
  );
};

export default TimelineWrapper;
