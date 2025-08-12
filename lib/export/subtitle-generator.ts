import { SubtitleStyle, FFmpegFilter } from './types';

export interface SubtitleSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
  confidence?: number;
}

export interface SubtitleOptions {
  style: SubtitleStyle;
  maxLineLength?: number;
  maxLinesPerSegment?: number;
  minDisplayTime?: number; // minimum time to display subtitle
  maxDisplayTime?: number; // maximum time to display subtitle
  lineBreakStrategy?: 'word' | 'character' | 'punctuation';
}

export class SubtitleGenerator {
  /**
   * Generate SRT format subtitles
   */
  generateSRT(segments: SubtitleSegment[]): string {
    return segments.map((segment, index) => {
      const startTime = this.formatSRTTime(segment.startTime);
      const endTime = this.formatSRTTime(segment.endTime);
      
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`;
    }).join('\n');
  }

  /**
   * Generate WebVTT format subtitles
   */
  generateVTT(segments: SubtitleSegment[], options?: { 
    includeStyles?: boolean;
    style?: SubtitleStyle;
  }): string {
    let vttContent = 'WEBVTT\n\n';
    
    // Add styling if requested
    if (options?.includeStyles && options?.style) {
      vttContent += this.generateVTTStyles(options.style) + '\n\n';
    }
    
    const cues = segments.map((segment, index) => {
      const startTime = this.formatVTTTime(segment.startTime);
      const endTime = this.formatVTTTime(segment.endTime);
      
      let cue = `${index + 1}\n${startTime} --> ${endTime}`;
      
      // Add positioning and styling
      if (options?.style) {
        const settings = this.generateVTTCueSettings(options.style);
        if (settings) cue += ` ${settings}`;
      }
      
      cue += `\n${segment.text}\n`;
      return cue;
    }).join('\n');
    
    return vttContent + cues;
  }

  /**
   * Generate ASS format subtitles (Advanced SubStation Alpha)
   */
  generateASS(segments: SubtitleSegment[], style: SubtitleStyle): string {
    const assHeader = this.generateASSHeader(style);
    
    const events = segments.map((segment, index) => {
      const startTime = this.formatASSTime(segment.startTime);
      const endTime = this.formatASSTime(segment.endTime);
      
      return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${segment.text}`;
    }).join('\n');
    
    return assHeader + '\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' + events;
  }

  /**
   * Generate FFmpeg filters for burned-in subtitles
   */
  generateBurnedSubtitleFilters(
    segments: SubtitleSegment[], 
    style: SubtitleStyle,
    videoWidth: number,
    videoHeight: number
  ): FFmpegFilter[] {
    const filters: FFmpegFilter[] = [];
    
    segments.forEach((segment, index) => {
      const filter: FFmpegFilter = {
        name: 'drawtext',
        options: {
          text: this.escapeTextForFFmpeg(segment.text),
          fontfile: this.getFontPath(style.fontFamily),
          fontsize: style.fontSize,
          fontcolor: style.color,
          x: this.calculateXPosition(style, videoWidth),
          y: this.calculateYPosition(style, videoHeight),
          enable: `between(t,${segment.startTime},${segment.endTime})`
        }
      };

      // Add text styling options
      if (style.strokeColor && style.strokeWidth) {
        filter.options!.bordercolor = style.strokeColor;
        filter.options!.borderw = style.strokeWidth;
      }

      if (style.shadowColor && style.shadowOffset) {
        filter.options!.shadowcolor = style.shadowColor;
        filter.options!.shadowx = style.shadowOffset.x;
        filter.options!.shadowy = style.shadowOffset.y;
      }

      if (style.backgroundColor) {
        filter.options!.box = '1';
        filter.options!.boxcolor = style.backgroundColor;
        if (style.padding) {
          filter.options!.boxborderw = Math.max(
            style.padding.left,
            style.padding.right,
            style.padding.top,
            style.padding.bottom
          );
        }
      }

      // Font weight mapping
      const fontWeightMap: Record<string, string> = {
        '100': 'thin',
        '200': 'extralight',
        '300': 'light',
        '400': 'normal',
        '500': 'medium',
        '600': 'semibold',
        '700': 'bold',
        '800': 'extrabold',
        '900': 'black'
      };
      
      if (style.fontWeight !== 'normal') {
        const weight = fontWeightMap[style.fontWeight] || style.fontWeight;
        filter.options!.fontweight = weight;
      }

      filters.push(filter);
    });

    return filters;
  }

  /**
   * Split long text into multiple lines
   */
  splitTextIntoLines(
    text: string, 
    maxLineLength: number = 40,
    maxLines: number = 2,
    strategy: 'word' | 'character' | 'punctuation' = 'word'
  ): string[] {
    if (text.length <= maxLineLength) {
      return [text];
    }

    const lines: string[] = [];
    let remainingText = text;

    for (let i = 0; i < maxLines && remainingText.length > 0; i++) {
      if (remainingText.length <= maxLineLength) {
        lines.push(remainingText);
        break;
      }

      let breakPoint = maxLineLength;
      
      if (strategy === 'word') {
        // Find last space before limit
        const lastSpace = remainingText.lastIndexOf(' ', maxLineLength);
        if (lastSpace > maxLineLength * 0.5) {
          breakPoint = lastSpace;
        }
      } else if (strategy === 'punctuation') {
        // Find last punctuation before limit
        const punctuation = /[.,!?;:]/g;
        let match;
        let lastPunctuation = -1;
        
        while ((match = punctuation.exec(remainingText)) !== null) {
          if (match.index <= maxLineLength) {
            lastPunctuation = match.index + 1;
          } else {
            break;
          }
        }
        
        if (lastPunctuation > maxLineLength * 0.5) {
          breakPoint = lastPunctuation;
        } else {
          // Fall back to word break
          const lastSpace = remainingText.lastIndexOf(' ', maxLineLength);
          if (lastSpace > maxLineLength * 0.5) {
            breakPoint = lastSpace;
          }
        }
      }

      lines.push(remainingText.substring(0, breakPoint).trim());
      remainingText = remainingText.substring(breakPoint).trim();
    }

    return lines;
  }

  /**
   * Optimize subtitle timing for better readability
   */
  optimizeSubtitleTiming(
    segments: SubtitleSegment[],
    options: {
      minDisplayTime?: number;
      maxDisplayTime?: number;
      minGapBetweenSubtitles?: number;
      readingSpeed?: number; // characters per second
    } = {}
  ): SubtitleSegment[] {
    const {
      minDisplayTime = 1.0,
      maxDisplayTime = 7.0,
      minGapBetweenSubtitles = 0.1,
      readingSpeed = 15
    } = options;

    const optimizedSegments = [...segments];

    for (let i = 0; i < optimizedSegments.length; i++) {
      const segment = optimizedSegments[i];
      const textLength = segment.text.length;
      const idealDisplayTime = Math.max(textLength / readingSpeed, minDisplayTime);
      
      // Calculate optimal end time
      let optimalEndTime = segment.startTime + Math.min(idealDisplayTime, maxDisplayTime);
      
      // Check if we need to adjust for next subtitle
      if (i < optimizedSegments.length - 1) {
        const nextSegment = optimizedSegments[i + 1];
        const maxEndTime = nextSegment.startTime - minGapBetweenSubtitles;
        
        if (optimalEndTime > maxEndTime) {
          optimalEndTime = maxEndTime;
        }
      }
      
      // Ensure minimum display time
      if (optimalEndTime - segment.startTime < minDisplayTime) {
        optimalEndTime = segment.startTime + minDisplayTime;
        
        // If this pushes into next subtitle, we might need to move next subtitle
        if (i < optimizedSegments.length - 1) {
          const nextSegment = optimizedSegments[i + 1];
          if (optimalEndTime + minGapBetweenSubtitles > nextSegment.startTime) {
            optimizedSegments[i + 1] = {
              ...nextSegment,
              startTime: optimalEndTime + minGapBetweenSubtitles
            };
          }
        }
      }
      
      optimizedSegments[i] = {
        ...segment,
        endTime: Math.max(optimalEndTime, segment.endTime)
      };
    }

    return optimizedSegments;
  }

  /**
   * Generate subtitle preview with styling
   */
  generatePreviewHTML(
    segments: SubtitleSegment[],
    style: SubtitleStyle,
    videoDimensions: { width: number; height: number }
  ): string {
    const styleCSS = this.generateCSSFromStyle(style, videoDimensions);
    
    const subtitleElements = segments.map((segment, index) => {
      return `
        <div class="subtitle-segment" 
             data-start="${segment.startTime}" 
             data-end="${segment.endTime}"
             style="display: none;">
          ${segment.text}
        </div>
      `;
    }).join('');

    return `
      <div class="subtitle-preview" style="position: relative; width: ${videoDimensions.width}px; height: ${videoDimensions.height}px;">
        <style>
          .subtitle-segment {
            ${styleCSS}
          }
          .subtitle-segment.active {
            display: block;
          }
        </style>
        ${subtitleElements}
      </div>
    `;
  }

  // Private helper methods
  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  private formatVTTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = (seconds % 60).toFixed(3);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
    }
  }

  private formatASSTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }

  private generateVTTStyles(style: SubtitleStyle): string {
    return `STYLE
::cue {
  color: ${style.color};
  font-family: ${style.fontFamily};
  font-size: ${style.fontSize}px;
  font-weight: ${style.fontWeight};
  text-align: ${style.alignment};
  ${style.backgroundColor ? `background-color: ${style.backgroundColor};` : ''}
}`;
  }

  private generateVTTCueSettings(style: SubtitleStyle): string {
    const settings: string[] = [];
    
    if (style.alignment === 'left') settings.push('align:left');
    else if (style.alignment === 'right') settings.push('align:right');
    else settings.push('align:center');
    
    // Position settings could be added here based on style.position
    
    return settings.join(' ');
  }

  private generateASSHeader(style: SubtitleStyle): string {
    return `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${style.fontSize},${this.colorToASS(style.color)},${this.colorToASS(style.color)},${style.strokeColor ? this.colorToASS(style.strokeColor) : '&H00000000'},${style.backgroundColor ? this.colorToASS(style.backgroundColor) : '&H00000000'},${style.fontWeight === 'bold' ? '1' : '0'},0,0,0,100,100,0,0,1,${style.strokeWidth || 0},0,2,10,10,10,1`;
  }

  private colorToASS(color: string): string {
    // Convert CSS color to ASS format (&HBBGGRR)
    if (color.startsWith('#')) {
      const r = color.substr(1, 2);
      const g = color.substr(3, 2);
      const b = color.substr(5, 2);
      return `&H00${b}${g}${r}`;
    }
    return '&H00FFFFFF'; // Default white
  }

  private escapeTextForFFmpeg(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\n/g, '\\n');
  }

  private getFontPath(fontFamily: string): string {
    // Map common font names to system paths
    const fontPaths: Record<string, string> = {
      'Arial': '/System/Library/Fonts/Arial.ttf',
      'Arial Black': '/System/Library/Fonts/Arial Black.ttf',
      'Helvetica': '/System/Library/Fonts/Helvetica.ttc',
      'Helvetica Neue': '/System/Library/Fonts/Helvetica Neue.ttc',
      'Roboto': '/System/Library/Fonts/Roboto-Regular.ttf',
      'Open Sans': '/System/Library/Fonts/OpenSans-Regular.ttf'
    };
    
    return fontPaths[fontFamily] || fontPaths['Arial'];
  }

  private calculateXPosition(style: SubtitleStyle, videoWidth: number): string {
    if (style.position) {
      return `${(style.position.x * videoWidth) / 100}`;
    }
    
    switch (style.alignment) {
      case 'left':
        return `${style.padding?.left || 10}`;
      case 'right':
        return `w-text_w-${style.padding?.right || 10}`;
      default: // center
        return '(w-text_w)/2';
    }
  }

  private calculateYPosition(style: SubtitleStyle, videoHeight: number): string {
    if (style.position) {
      return `${(style.position.y * videoHeight) / 100}`;
    }
    
    // Default to bottom third of video
    const bottomMargin = style.padding?.bottom || 50;
    return `h-text_h-${bottomMargin}`;
  }

  private generateCSSFromStyle(
    style: SubtitleStyle, 
    videoDimensions: { width: number; height: number }
  ): string {
    let css = `
      position: absolute;
      font-family: ${style.fontFamily};
      font-size: ${style.fontSize}px;
      font-weight: ${style.fontWeight};
      color: ${style.color};
      text-align: ${style.alignment};
      white-space: pre-wrap;
      word-wrap: break-word;
      max-width: 80%;
    `;

    if (style.backgroundColor) {
      css += `background-color: ${style.backgroundColor};`;
    }

    if (style.strokeColor && style.strokeWidth) {
      css += `
        text-shadow: 
          -${style.strokeWidth}px -${style.strokeWidth}px 0 ${style.strokeColor},
          ${style.strokeWidth}px -${style.strokeWidth}px 0 ${style.strokeColor},
          -${style.strokeWidth}px ${style.strokeWidth}px 0 ${style.strokeColor},
          ${style.strokeWidth}px ${style.strokeWidth}px 0 ${style.strokeColor};
      `;
    } else if (style.shadowColor && style.shadowOffset) {
      css += `text-shadow: ${style.shadowOffset.x}px ${style.shadowOffset.y}px 0 ${style.shadowColor};`;
    }

    if (style.padding) {
      css += `padding: ${style.padding.top}px ${style.padding.right}px ${style.padding.bottom}px ${style.padding.left}px;`;
    }

    // Position the subtitle
    if (style.position) {
      css += `
        left: ${style.position.x}%;
        top: ${style.position.y}%;
        transform: translate(-50%, -50%);
      `;
    } else {
      // Default positioning based on alignment
      css += `
        left: 50%;
        bottom: 10%;
        transform: translateX(-50%);
      `;
    }

    return css;
  }
}