import path from 'path';
import { CropRegion, VideoAnalysisResult } from './types';

export interface FaceDetectionResult {
  faces: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    landmarks?: {
      leftEye: { x: number; y: number };
      rightEye: { x: number; y: number };
      nose: { x: number; y: number };
      mouth: { x: number; y: number };
    };
  }>;
  timestamp: number;
}

export interface ObjectDetectionResult {
  objects: Array<{
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
  timestamp: number;
}

export interface AutoCropOptions {
  targetAspectRatio: string; // e.g., "9:16", "1:1", "16:9"
  enableFaceTracking: boolean;
  enableObjectTracking: boolean;
  smoothingFactor: number; // 0-1, higher = smoother but less responsive
  minConfidence: number; // minimum detection confidence
  paddingPercent: number; // percentage of padding around detected subjects
  maxCropMovement: number; // maximum pixels crop can move between frames
  sampleInterval: number; // seconds between analysis samples
}

export class AutoCropProcessor {
  private videoWidth: number = 0;
  private videoHeight: number = 0;
  private targetWidth: number = 0;
  private targetHeight: number = 0;
  private aspectRatio: number = 1;

  constructor() {}

  /**
   * Initialize the auto-crop processor with video dimensions and target aspect ratio
   */
  initialize(
    videoWidth: number,
    videoHeight: number,
    targetAspectRatio: string
  ): void {
    this.videoWidth = videoWidth;
    this.videoHeight = videoHeight;
    
    // Parse aspect ratio (e.g., "16:9" -> 16/9)
    const [w, h] = targetAspectRatio.split(':').map(Number);
    this.aspectRatio = w / h;
    
    // Calculate target dimensions that fit within source video
    if (videoWidth / videoHeight > this.aspectRatio) {
      // Source is wider than target - crop horizontally
      this.targetHeight = videoHeight;
      this.targetWidth = Math.floor(videoHeight * this.aspectRatio);
    } else {
      // Source is taller than target - crop vertically
      this.targetWidth = videoWidth;
      this.targetHeight = Math.floor(videoWidth / this.aspectRatio);
    }
  }

  /**
   * Analyze video frames to detect faces and objects for cropping
   */
  async analyzeVideo(
    videoPath: string,
    options: AutoCropOptions
  ): Promise<VideoAnalysisResult> {
    // This would integrate with computer vision libraries like OpenCV or MediaPipe
    // For now, we'll return a mock analysis result
    
    const duration = await this.getVideoDuration(videoPath);
    const sampleCount = Math.ceil(duration / options.sampleInterval);
    
    const faces: VideoAnalysisResult['faces'] = [];
    const objects: VideoAnalysisResult['objects'] = [];
    
    // Simulate face detection across video timeline
    for (let i = 0; i < sampleCount; i++) {
      const timestamp = i * options.sampleInterval;
      
      // Mock face detection (in real implementation, this would call ML models)
      if (options.enableFaceTracking) {
        const mockFace = this.generateMockFaceDetection(timestamp);
        if (mockFace && mockFace.confidence >= options.minConfidence) {
          faces.push({
            boundingBox: {
              x: mockFace.x,
              y: mockFace.y,
              width: mockFace.width,
              height: mockFace.height,
              confidence: mockFace.confidence
            },
            confidence: mockFace.confidence,
            timeRange: { start: timestamp, end: timestamp + options.sampleInterval }
          });
        }
      }
    }

    // Generate recommended crops based on detected content
    const recommendedCrops = this.generateRecommendedCrops(faces, objects, options);
    
    return {
      faces,
      objects,
      recommendedCrops,
      qualityMetrics: {
        averageBrightness: 0.6,
        contrast: 0.7,
        sharpness: 0.8,
        colorfulness: 0.5
      }
    };
  }

  /**
   * Generate smooth crop region keyframes for the entire video
   */
  generateCropKeyframes(
    analysisResult: VideoAnalysisResult,
    options: AutoCropOptions
  ): Array<{
    time: number;
    region: CropRegion;
  }> {
    const keyframes: Array<{ time: number; region: CropRegion }> = [];
    
    if (analysisResult.faces.length === 0) {
      // No faces detected - use center crop
      const centerCrop = this.calculateCenterCrop();
      keyframes.push({ time: 0, region: centerCrop });
      return keyframes;
    }

    // Group faces by time and calculate weighted average position
    const timeSlots = new Map<number, Array<typeof analysisResult.faces[0]>>();
    
    analysisResult.faces.forEach(face => {
      const timeSlot = Math.floor(face.timeRange.start / options.sampleInterval) * options.sampleInterval;
      if (!timeSlots.has(timeSlot)) {
        timeSlots.set(timeSlot, []);
      }
      timeSlots.get(timeSlot)!.push(face);
    });

    // Generate keyframes for each time slot
    Array.from(timeSlots.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([time, faces]) => {
        const cropRegion = this.calculateOptimalCrop(faces, options);
        keyframes.push({ time, region: cropRegion });
      });

    // Smooth the keyframes to prevent jarring movements
    return this.smoothCropKeyframes(keyframes, options.smoothingFactor, options.maxCropMovement);
  }

  /**
   * Generate FFmpeg filters for auto-cropping
   */
  generateCropFilters(
    keyframes: Array<{ time: number; region: CropRegion }>,
    videoDuration: number
  ): string[] {
    if (keyframes.length === 0) return [];
    
    if (keyframes.length === 1) {
      // Static crop
      const region = keyframes[0].region;
      return [`crop=${region.width}:${region.height}:${region.x}:${region.y}`];
    }

    // Dynamic crop with smooth transitions
    const cropExpressions = this.generateSmoothCropExpressions(keyframes, videoDuration);
    return [
      `crop=${this.targetWidth}:${this.targetHeight}:${cropExpressions.x}:${cropExpressions.y}`
    ];
  }

  /**
   * Preview the crop region at a specific time
   */
  previewCropAtTime(
    analysisResult: VideoAnalysisResult,
    time: number,
    options: AutoCropOptions
  ): CropRegion {
    const relevantFaces = analysisResult.faces.filter(
      face => time >= face.timeRange.start && time <= face.timeRange.end
    );

    if (relevantFaces.length === 0) {
      return this.calculateCenterCrop();
    }

    return this.calculateOptimalCrop(relevantFaces, options);
  }

  // Private helper methods
  private async getVideoDuration(videoPath: string): Promise<number> {
    // This would use FFprobe to get video duration
    // For now, return a mock duration
    return 30; // 30 seconds
  }

  private generateMockFaceDetection(timestamp: number): FaceDetectionResult['faces'][0] | null {
    // Simulate face detection with some randomness and movement
    const baseX = this.videoWidth * 0.3 + Math.sin(timestamp * 0.5) * 50;
    const baseY = this.videoHeight * 0.2 + Math.cos(timestamp * 0.3) * 30;
    
    return {
      x: Math.max(0, Math.min(baseX, this.videoWidth - 200)),
      y: Math.max(0, Math.min(baseY, this.videoHeight - 200)),
      width: 200,
      height: 200,
      confidence: 0.85 + Math.random() * 0.1,
      landmarks: {
        leftEye: { x: baseX + 60, y: baseY + 70 },
        rightEye: { x: baseX + 140, y: baseY + 70 },
        nose: { x: baseX + 100, y: baseY + 110 },
        mouth: { x: baseX + 100, y: baseY + 150 }
      }
    };
  }

  private generateRecommendedCrops(
    faces: VideoAnalysisResult['faces'],
    objects: VideoAnalysisResult['objects'],
    options: AutoCropOptions
  ): VideoAnalysisResult['recommendedCrops'] {
    // Calculate crop regions for different aspect ratios
    const vertical = this.calculateOptimalCropForAspectRatio(faces, "9:16", options);
    const square = this.calculateOptimalCropForAspectRatio(faces, "1:1", options);
    const horizontal = this.calculateOptimalCropForAspectRatio(faces, "16:9", options);

    return { vertical, square, horizontal };
  }

  private calculateOptimalCropForAspectRatio(
    faces: VideoAnalysisResult['faces'],
    aspectRatio: string,
    options: AutoCropOptions
  ): CropRegion {
    if (faces.length === 0) {
      return this.calculateCenterCropForAspectRatio(aspectRatio);
    }

    // Calculate bounding box that includes all faces
    let minX = this.videoWidth, minY = this.videoHeight;
    let maxX = 0, maxY = 0;
    let totalConfidence = 0;

    faces.forEach(face => {
      const bbox = face.boundingBox;
      minX = Math.min(minX, bbox.x);
      minY = Math.min(minY, bbox.y);
      maxX = Math.max(maxX, bbox.x + bbox.width);
      maxY = Math.max(maxY, bbox.y + bbox.height);
      totalConfidence += bbox.confidence;
    });

    // Add padding
    const paddingX = (maxX - minX) * options.paddingPercent / 100;
    const paddingY = (maxY - minY) * options.paddingPercent / 100;
    
    minX = Math.max(0, minX - paddingX);
    minY = Math.max(0, minY - paddingY);
    maxX = Math.min(this.videoWidth, maxX + paddingX);
    maxY = Math.min(this.videoHeight, maxY + paddingY);

    // Calculate crop region with target aspect ratio
    const [w, h] = aspectRatio.split(':').map(Number);
    const targetAspect = w / h;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    let cropWidth, cropHeight;
    
    if (contentWidth / contentHeight > targetAspect) {
      // Content is wider than target - fit height, center horizontally
      cropHeight = Math.min(contentHeight, this.videoHeight);
      cropWidth = Math.min(cropHeight * targetAspect, this.videoWidth);
    } else {
      // Content is taller than target - fit width, center vertically
      cropWidth = Math.min(contentWidth, this.videoWidth);
      cropHeight = Math.min(cropWidth / targetAspect, this.videoHeight);
    }

    // Center the crop region on the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const cropX = Math.max(0, Math.min(centerX - cropWidth / 2, this.videoWidth - cropWidth));
    const cropY = Math.max(0, Math.min(centerY - cropHeight / 2, this.videoHeight - cropHeight));

    return {
      x: Math.round(cropX),
      y: Math.round(cropY),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
      confidence: totalConfidence / faces.length
    };
  }

  private calculateCenterCrop(): CropRegion {
    const centerX = (this.videoWidth - this.targetWidth) / 2;
    const centerY = (this.videoHeight - this.targetHeight) / 2;

    return {
      x: Math.round(centerX),
      y: Math.round(centerY),
      width: this.targetWidth,
      height: this.targetHeight,
      confidence: 1.0
    };
  }

  private calculateCenterCropForAspectRatio(aspectRatio: string): CropRegion {
    const [w, h] = aspectRatio.split(':').map(Number);
    const targetAspect = w / h;
    
    let cropWidth, cropHeight;
    
    if (this.videoWidth / this.videoHeight > targetAspect) {
      cropHeight = this.videoHeight;
      cropWidth = Math.floor(this.videoHeight * targetAspect);
    } else {
      cropWidth = this.videoWidth;
      cropHeight = Math.floor(this.videoWidth / targetAspect);
    }

    const centerX = (this.videoWidth - cropWidth) / 2;
    const centerY = (this.videoHeight - cropHeight) / 2;

    return {
      x: Math.round(centerX),
      y: Math.round(centerY),
      width: cropWidth,
      height: cropHeight,
      confidence: 1.0
    };
  }

  private calculateOptimalCrop(
    faces: Array<VideoAnalysisResult['faces'][0]>,
    options: AutoCropOptions
  ): CropRegion {
    if (faces.length === 0) {
      return this.calculateCenterCrop();
    }

    // Calculate weighted center of all faces
    let weightedX = 0, weightedY = 0, totalWeight = 0;

    faces.forEach(face => {
      const bbox = face.boundingBox;
      const weight = bbox.confidence;
      const centerX = bbox.x + bbox.width / 2;
      const centerY = bbox.y + bbox.height / 2;
      
      weightedX += centerX * weight;
      weightedY += centerY * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) {
      return this.calculateCenterCrop();
    }

    weightedX /= totalWeight;
    weightedY /= totalWeight;

    // Position crop region centered on weighted average
    const cropX = Math.max(0, Math.min(weightedX - this.targetWidth / 2, this.videoWidth - this.targetWidth));
    const cropY = Math.max(0, Math.min(weightedY - this.targetHeight / 2, this.videoHeight - this.targetHeight));

    return {
      x: Math.round(cropX),
      y: Math.round(cropY),
      width: this.targetWidth,
      height: this.targetHeight,
      confidence: totalWeight / faces.length
    };
  }

  private smoothCropKeyframes(
    keyframes: Array<{ time: number; region: CropRegion }>,
    smoothingFactor: number,
    maxMovement: number
  ): Array<{ time: number; region: CropRegion }> {
    if (keyframes.length <= 1) return keyframes;

    const smoothed = [keyframes[0]];

    for (let i = 1; i < keyframes.length; i++) {
      const current = keyframes[i];
      const previous = smoothed[i - 1];
      
      // Apply smoothing
      const smoothX = previous.region.x + (current.region.x - previous.region.x) * smoothingFactor;
      const smoothY = previous.region.y + (current.region.y - previous.region.y) * smoothingFactor;
      
      // Limit movement speed
      const deltaX = smoothX - previous.region.x;
      const deltaY = smoothY - previous.region.y;
      const movement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      let finalX = smoothX;
      let finalY = smoothY;
      
      if (movement > maxMovement) {
        const ratio = maxMovement / movement;
        finalX = previous.region.x + deltaX * ratio;
        finalY = previous.region.y + deltaY * ratio;
      }

      smoothed.push({
        time: current.time,
        region: {
          ...current.region,
          x: Math.round(finalX),
          y: Math.round(finalY)
        }
      });
    }

    return smoothed;
  }

  private generateSmoothCropExpressions(
    keyframes: Array<{ time: number; region: CropRegion }>,
    duration: number
  ): { x: string; y: string } {
    if (keyframes.length === 1) {
      return {
        x: keyframes[0].region.x.toString(),
        y: keyframes[0].region.y.toString()
      };
    }

    // Generate interpolation expressions for smooth movement
    let xExpression = '';
    let yExpression = '';

    for (let i = 0; i < keyframes.length - 1; i++) {
      const current = keyframes[i];
      const next = keyframes[i + 1];
      
      const startTime = current.time;
      const endTime = next.time;
      const timeRange = endTime - startTime;
      
      if (i > 0) {
        xExpression += '+';
        yExpression += '+';
      }

      // Linear interpolation between keyframes
      xExpression += `if(gte(t,${startTime})*lt(t,${endTime}),${current.region.x}+(${next.region.x}-${current.region.x})*(t-${startTime})/${timeRange},0)`;
      yExpression += `if(gte(t,${startTime})*lt(t,${endTime}),${current.region.y}+(${next.region.y}-${current.region.y})*(t-${startTime})/${timeRange},0)`;
    }

    // Handle the last segment
    const lastKeyframe = keyframes[keyframes.length - 1];
    if (keyframes.length > 1) {
      xExpression += `+if(gte(t,${lastKeyframe.time}),${lastKeyframe.region.x},0)`;
      yExpression += `+if(gte(t,${lastKeyframe.time}),${lastKeyframe.region.y},0)`;
    }

    return { x: xExpression, y: yExpression };
  }
}