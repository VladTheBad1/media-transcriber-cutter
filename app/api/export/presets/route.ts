import { NextRequest, NextResponse } from 'next/server';
import { 
  SOCIAL_MEDIA_PRESETS, 
  AUDIO_PRESETS, 
  QUALITY_PRESETS,
  getPresetsByPlatform,
  getRecommendedPresetsForPlatform
} from '@/lib/export';

/**
 * GET /api/export/presets
 * Get all available export presets or filter by platform
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const type = searchParams.get('type'); // 'video', 'audio', 'all'

    let presets = [];

    if (platform) {
      if (platform === 'recommended') {
        // Get recommended presets for all major platforms
        const platforms = ['TikTok', 'Instagram', 'YouTube', 'Twitter', 'LinkedIn'];
        const recommendedPresets = platforms.flatMap(p => 
          getRecommendedPresetsForPlatform(p).slice(0, 1) // Get top preset for each platform
        );
        presets = recommendedPresets;
      } else {
        presets = getPresetsByPlatform(platform);
      }
    } else {
      // Return all presets based on type
      switch (type) {
        case 'video':
          presets = SOCIAL_MEDIA_PRESETS;
          break;
        case 'audio':
          presets = AUDIO_PRESETS;
          break;
        case 'all':
        default:
          presets = [...SOCIAL_MEDIA_PRESETS, ...AUDIO_PRESETS];
          break;
      }
    }

    return NextResponse.json({
      success: true,
      presets,
      qualityPresets: QUALITY_PRESETS,
      count: presets.length
    });

  } catch (error) {
    console.error('Error fetching export presets:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch export presets',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/export/presets/validate
 * Validate a preset against media constraints
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { presetId, duration, estimatedFileSize } = body;

    if (!presetId || typeof duration !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Preset ID and duration are required' },
        { status: 400 }
      );
    }

    const allPresets = [...SOCIAL_MEDIA_PRESETS, ...AUDIO_PRESETS];
    const preset = allPresets.find(p => p.id === presetId);

    if (!preset) {
      return NextResponse.json(
        { success: false, error: 'Preset not found' },
        { status: 404 }
      );
    }

    // Validate constraints
    const warnings: string[] = [];
    const errors: string[] = [];

    if (preset.constraints) {
      const { maxDuration, maxFileSize, minFileSize } = preset.constraints;

      if (maxDuration && duration > maxDuration) {
        errors.push(`Duration ${Math.round(duration)}s exceeds maximum ${maxDuration}s for ${preset.platform}`);
      }

      if (maxFileSize && estimatedFileSize && estimatedFileSize > maxFileSize) {
        const maxSizeMB = Math.round(maxFileSize / (1024 * 1024));
        const estimatedSizeMB = Math.round(estimatedFileSize / (1024 * 1024));
        warnings.push(`Estimated size ${estimatedSizeMB}MB may exceed ${maxSizeMB}MB limit`);
      }

      if (minFileSize && estimatedFileSize && estimatedFileSize < minFileSize) {
        warnings.push(`File size may be too small for optimal quality`);
      }
    }

    // Estimate processing time
    let processingTimeMultiplier = 1.0;
    if (preset.optimization?.twoPass) processingTimeMultiplier *= 2.0;
    if (preset.processing?.autoCrop) processingTimeMultiplier *= 1.5;
    if (preset.processing?.faceTracking) processingTimeMultiplier *= 1.3;
    if (preset.processing?.noiseReduction) processingTimeMultiplier *= 1.2;

    const estimatedProcessingTime = duration * processingTimeMultiplier;

    return NextResponse.json({
      success: true,
      validation: {
        valid: errors.length === 0,
        warnings,
        errors,
        preset,
        estimates: {
          processingTime: estimatedProcessingTime,
          fileSize: estimatedFileSize,
          compressionRatio: preset.video ? 
            (estimatedFileSize / (duration * 1000000)) : // Rough estimate
            undefined
        }
      }
    });

  } catch (error) {
    console.error('Error validating preset:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to validate preset',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}