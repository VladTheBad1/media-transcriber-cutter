import { PrismaClient } from '@prisma/client';
import { TranscriptionSegment, Speaker, WordTimestamp } from '../transcription/whisperx';

const prisma = new PrismaClient();

export interface HighlightCriteria {
  // Engagement metrics
  minConfidence?: number;
  maxSilenceDuration?: number;
  minSegmentDuration?: number;
  maxSegmentDuration?: number;
  
  // Content analysis
  detectLaughter?: boolean;
  detectApplause?: boolean;
  detectEmphasis?: boolean;
  detectTopicChanges?: boolean;
  detectQuestions?: boolean;
  
  // Speaker analysis
  speakerChangeWeight?: number;
  speakerDominanceThreshold?: number;
  
  // Sentiment analysis
  enableSentimentAnalysis?: boolean;
  targetSentiments?: ('positive' | 'negative' | 'neutral' | 'excited' | 'emphatic')[];
  
  // Keyword analysis
  keywords?: string[];
  keywordWeight?: number;
  
  // Output preferences
  highlightCount?: number;
  socialMediaLength?: number; // seconds for social clips
  chapterMinLength?: number; // minimum chapter length
}

export interface AnalysisResult {
  confidence: number;
  reason: string;
  engagement: number;
  sentiment: string;
  keywords: string[];
  features: HighlightFeature[];
}

export interface HighlightFeature {
  type: 'laughter' | 'applause' | 'emphasis' | 'topic_change' | 'question' | 'silence_removal' | 'speaker_change' | 'keyword' | 'sentiment';
  confidence: number;
  weight: number;
  description: string;
}

export interface HighlightSuggestion {
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  confidence: number;
  reason: string;
  engagement: number;
  sentiment: string;
  keywords: string[];
  type: 'auto_highlight' | 'social_clip' | 'chapter_marker' | 'silence_removal';
}

export interface ChapterMarker {
  title: string;
  startTime: number;
  endTime: number;
  summary: string;
  confidence: number;
  topicKeywords: string[];
}

export class HighlightGenerator {
  private readonly criteria: Required<HighlightCriteria>;
  
  constructor(criteria: HighlightCriteria = {}) {
    this.criteria = {
      minConfidence: criteria.minConfidence ?? 0.7,
      maxSilenceDuration: criteria.maxSilenceDuration ?? 2.0,
      minSegmentDuration: criteria.minSegmentDuration ?? 5.0,
      maxSegmentDuration: criteria.maxSegmentDuration ?? 60.0,
      detectLaughter: criteria.detectLaughter ?? true,
      detectApplause: criteria.detectApplause ?? true,
      detectEmphasis: criteria.detectEmphasis ?? true,
      detectTopicChanges: criteria.detectTopicChanges ?? true,
      detectQuestions: criteria.detectQuestions ?? true,
      speakerChangeWeight: criteria.speakerChangeWeight ?? 0.3,
      speakerDominanceThreshold: criteria.speakerDominanceThreshold ?? 0.8,
      enableSentimentAnalysis: criteria.enableSentimentAnalysis ?? true,
      targetSentiments: criteria.targetSentiments ?? ['positive', 'excited', 'emphatic'],
      keywords: criteria.keywords ?? [],
      keywordWeight: criteria.keywordWeight ?? 0.4,
      highlightCount: criteria.highlightCount ?? 10,
      socialMediaLength: criteria.socialMediaLength ?? 30,
      chapterMinLength: criteria.chapterMinLength ?? 300, // 5 minutes
    };
  }

  /**
   * Analyze transcript and generate highlight suggestions
   */
  async analyzeTranscript(transcriptId: string): Promise<HighlightSuggestion[]> {
    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      include: {
        segments: {
          include: {
            words: true,
            speaker: true,
          },
          orderBy: { start: 'asc' },
        },
        speakers: true,
        mediaFile: true,
      },
    });

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    console.log(`Analyzing transcript ${transcriptId} with ${transcript.segments.length} segments`);

    // Convert segments to our format for analysis
    const segments: TranscriptionSegment[] = transcript.segments.map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker: segment.speaker ? {
        id: segment.speaker.id,
        label: segment.speaker.label,
        name: segment.speaker.name || undefined,
        totalDuration: segment.speaker.totalDuration,
        segmentCount: segment.speaker.segmentCount,
        averageConfidence: segment.speaker.averageConfidence,
      } : undefined,
      words: segment.words.map(word => ({
        word: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence,
      })),
    }));

    const speakers: Speaker[] = transcript.speakers.map(speaker => ({
      id: speaker.id,
      label: speaker.label,
      name: speaker.name || undefined,
      totalDuration: speaker.totalDuration,
      segmentCount: speaker.segmentCount,
      averageConfidence: speaker.averageConfidence,
    }));

    // Run all analysis methods
    const highlights: HighlightSuggestion[] = [];
    
    // Engagement-based highlights
    highlights.push(...await this.detectEngagementHighlights(segments));
    
    // Content-based highlights
    highlights.push(...await this.detectContentHighlights(segments));
    
    // Speaker-based highlights
    if (speakers.length > 1) {
      highlights.push(...await this.detectSpeakerHighlights(segments, speakers));
    }
    
    // Sentiment-based highlights
    if (this.criteria.enableSentimentAnalysis) {
      highlights.push(...await this.detectSentimentHighlights(segments));
    }
    
    // Social media clips
    highlights.push(...await this.generateSocialClips(segments));
    
    // Silence removal suggestions
    highlights.push(...await this.detectSilenceForRemoval(segments));

    // Sort by confidence and engagement
    highlights.sort((a, b) => {
      const scoreA = a.confidence * 0.6 + a.engagement * 0.4;
      const scoreB = b.confidence * 0.6 + b.engagement * 0.4;
      return scoreB - scoreA;
    });

    // Remove overlapping highlights (keep highest scoring)
    const filteredHighlights = this.removeOverlappingHighlights(highlights);

    // Limit to requested count
    return filteredHighlights.slice(0, this.criteria.highlightCount);
  }

  /**
   * Generate chapter markers for long-form content
   */
  async generateChapters(transcriptId: string): Promise<ChapterMarker[]> {
    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      include: {
        segments: {
          include: { words: true },
          orderBy: { start: 'asc' },
        },
      },
    });

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    const segments: TranscriptionSegment[] = transcript.segments.map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      words: segment.words.map(word => ({
        word: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence,
      })),
    }));

    return await this.detectTopicChanges(segments);
  }

  /**
   * Detect engagement-based highlights (high confidence, dynamic speech)
   */
  private async detectEngagementHighlights(segments: TranscriptionSegment[]): Promise<HighlightSuggestion[]> {
    const highlights: HighlightSuggestion[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const nextSegment = segments[i + 1];
      
      // Calculate engagement metrics
      const confidence = segment.confidence;
      const hasWords = segment.words && segment.words.length > 0;
      const wordDensity = hasWords ? segment.words!.length / (segment.end - segment.start) : 0;
      
      // Look for rapid speech (high word density) with high confidence
      if (confidence >= this.criteria.minConfidence && wordDensity > 3) {
        const engagement = Math.min(1.0, (wordDensity / 5) * confidence);
        
        let endTime = segment.end;
        let combinedText = segment.text;
        
        // Extend highlight if next segments are also high engagement
        let j = i + 1;
        while (j < segments.length && 
               segments[j].confidence >= this.criteria.minConfidence * 0.9 &&
               (endTime - segment.start) < this.criteria.maxSegmentDuration) {
          endTime = segments[j].end;
          combinedText += ' ' + segments[j].text;
          j++;
        }
        
        const duration = endTime - segment.start;
        
        if (duration >= this.criteria.minSegmentDuration) {
          highlights.push({
            title: this.generateTitle(combinedText),
            startTime: segment.start,
            endTime,
            duration,
            confidence,
            reason: 'High engagement: rapid, confident speech',
            engagement,
            sentiment: 'neutral',
            keywords: this.extractKeywords(combinedText),
            type: 'auto_highlight',
          });
          
          i = j - 1; // Skip processed segments
        }
      }
    }
    
    return highlights;
  }

  /**
   * Detect content-based highlights (laughter, applause, emphasis)
   */
  private async detectContentHighlights(segments: TranscriptionSegment[]): Promise<HighlightSuggestion[]> {
    const highlights: HighlightSuggestion[] = [];
    
    for (const segment of segments) {
      const text = segment.text.toLowerCase();
      const features: HighlightFeature[] = [];
      let totalWeight = 0;
      
      // Detect laughter
      if (this.criteria.detectLaughter && this.containsLaughter(text)) {
        const feature: HighlightFeature = {
          type: 'laughter',
          confidence: 0.9,
          weight: 0.8,
          description: 'Contains laughter or humor indicators',
        };
        features.push(feature);
        totalWeight += feature.weight;
      }
      
      // Detect applause
      if (this.criteria.detectApplause && this.containsApplause(text)) {
        const feature: HighlightFeature = {
          type: 'applause',
          confidence: 0.95,
          weight: 0.9,
          description: 'Contains applause or positive audience reaction',
        };
        features.push(feature);
        totalWeight += feature.weight;
      }
      
      // Detect emphasis
      if (this.criteria.detectEmphasis && this.containsEmphasis(text)) {
        const feature: HighlightFeature = {
          type: 'emphasis',
          confidence: 0.7,
          weight: 0.6,
          description: 'Contains emphatic language or strong statements',
        };
        features.push(feature);
        totalWeight += feature.weight;
      }
      
      // Detect questions
      if (this.criteria.detectQuestions && this.containsQuestion(text)) {
        const feature: HighlightFeature = {
          type: 'question',
          confidence: 0.8,
          weight: 0.5,
          description: 'Contains questions or interactive elements',
        };
        features.push(feature);
        totalWeight += feature.weight;
      }
      
      // Check for keywords
      if (this.criteria.keywords.length > 0) {
        const foundKeywords = this.findKeywords(text, this.criteria.keywords);
        if (foundKeywords.length > 0) {
          const feature: HighlightFeature = {
            type: 'keyword',
            confidence: 0.9,
            weight: this.criteria.keywordWeight * foundKeywords.length,
            description: `Contains keywords: ${foundKeywords.join(', ')}`,
          };
          features.push(feature);
          totalWeight += feature.weight;
        }
      }
      
      // Create highlight if any features detected
      if (features.length > 0 && totalWeight > 0.5) {
        const duration = segment.end - segment.start;
        const confidence = features.reduce((sum, f) => sum + f.confidence, 0) / features.length;
        const engagement = Math.min(1.0, totalWeight);
        
        highlights.push({
          title: this.generateTitle(segment.text),
          startTime: segment.start,
          endTime: segment.end,
          duration,
          confidence,
          reason: features.map(f => f.description).join('; '),
          engagement,
          sentiment: this.analyzeSentiment(text),
          keywords: this.extractKeywords(segment.text),
          type: 'auto_highlight',
        });
      }
    }
    
    return highlights;
  }

  /**
   * Detect speaker-based highlights (transitions, dominance changes)
   */
  private async detectSpeakerHighlights(segments: TranscriptionSegment[], speakers: Speaker[]): Promise<HighlightSuggestion[]> {
    const highlights: HighlightSuggestion[] = [];
    let currentSpeaker: string | undefined;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const speakerId = segment.speaker?.id;
      
      // Detect speaker changes
      if (speakerId && speakerId !== currentSpeaker) {
        const prevSpeaker = currentSpeaker;
        currentSpeaker = speakerId;
        
        // Look for significant speaker transitions
        if (prevSpeaker && this.criteria.speakerChangeWeight > 0) {
          const prevSpeakerData = speakers.find(s => s.id === prevSpeaker);
          const currSpeakerData = speakers.find(s => s.id === speakerId);
          
          if (prevSpeakerData && currSpeakerData) {
            // Detect transitions between dominant and non-dominant speakers
            const prevDominance = prevSpeakerData.totalDuration / speakers.reduce((sum, s) => sum + s.totalDuration, 0);
            const currDominance = currSpeakerData.totalDuration / speakers.reduce((sum, s) => sum + s.totalDuration, 0);
            
            const dominanceChange = Math.abs(prevDominance - currDominance);
            
            if (dominanceChange > 0.3) {
              const confidence = Math.min(0.9, dominanceChange * 2);
              const engagement = this.criteria.speakerChangeWeight;
              
              // Extend to include context around speaker change
              const startTime = Math.max(0, segment.start - 2);
              const endTime = Math.min(segments[segments.length - 1].end, segment.end + 10);
              const duration = endTime - startTime;
              
              if (duration >= this.criteria.minSegmentDuration) {
                highlights.push({
                  title: `${prevSpeakerData.label} to ${currSpeakerData.label} transition`,
                  startTime,
                  endTime,
                  duration,
                  confidence,
                  reason: 'Significant speaker transition between dominant speakers',
                  engagement,
                  sentiment: 'neutral',
                  keywords: [`${prevSpeakerData.label}`, `${currSpeakerData.label}`],
                  type: 'auto_highlight',
                });
              }
            }
          }
        }
      }
    }
    
    return highlights;
  }

  /**
   * Detect sentiment-based highlights
   */
  private async detectSentimentHighlights(segments: TranscriptionSegment[]): Promise<HighlightSuggestion[]> {
    const highlights: HighlightSuggestion[] = [];
    
    for (const segment of segments) {
      const sentiment = this.analyzeSentiment(segment.text);
      
      if (this.criteria.targetSentiments.includes(sentiment as any)) {
        const confidence = this.getSentimentConfidence(segment.text, sentiment);
        
        if (confidence >= this.criteria.minConfidence) {
          const duration = segment.end - segment.start;
          
          if (duration >= this.criteria.minSegmentDuration) {
            highlights.push({
              title: this.generateTitle(segment.text),
              startTime: segment.start,
              endTime: segment.end,
              duration,
              confidence,
              reason: `${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)} sentiment detected`,
              engagement: confidence * 0.8,
              sentiment,
              keywords: this.extractKeywords(segment.text),
              type: 'auto_highlight',
            });
          }
        }
      }
    }
    
    return highlights;
  }

  /**
   * Generate social media clips (short, engaging segments)
   */
  private async generateSocialClips(segments: TranscriptionSegment[]): Promise<HighlightSuggestion[]> {
    const clips: HighlightSuggestion[] = [];
    
    // Look for high-engagement sequences that fit social media length
    for (let i = 0; i < segments.length; i++) {
      let currentTime = segments[i].start;
      let endTime = currentTime;
      let combinedText = '';
      let totalConfidence = 0;
      let segmentCount = 0;
      
      // Build clips up to social media length
      for (let j = i; j < segments.length && (endTime - currentTime) < this.criteria.socialMediaLength; j++) {
        const segment = segments[j];
        if (segment.start > endTime + 1) break; // Gap too large
        
        endTime = segment.end;
        combinedText += ' ' + segment.text;
        totalConfidence += segment.confidence;
        segmentCount++;
      }
      
      const duration = endTime - currentTime;
      const avgConfidence = totalConfidence / segmentCount;
      
      // Check if this makes a good social clip
      if (duration >= 10 && duration <= this.criteria.socialMediaLength && 
          avgConfidence >= this.criteria.minConfidence &&
          this.isGoodSocialContent(combinedText)) {
        
        clips.push({
          title: `Social Clip: ${this.generateTitle(combinedText)}`,
          startTime: currentTime,
          endTime,
          duration,
          confidence: avgConfidence,
          reason: 'Optimized for social media sharing',
          engagement: this.calculateSocialEngagement(combinedText),
          sentiment: this.analyzeSentiment(combinedText),
          keywords: this.extractKeywords(combinedText),
          type: 'social_clip',
        });
      }
      
      // Skip some segments to avoid too much overlap
      i += Math.max(1, Math.floor(segmentCount / 2));
    }
    
    return clips;
  }

  /**
   * Detect silence for removal suggestions
   */
  private async detectSilenceForRemoval(segments: TranscriptionSegment[]): Promise<HighlightSuggestion[]> {
    const silenceRemovals: HighlightSuggestion[] = [];
    
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      
      const gap = next.start - current.end;
      
      if (gap > this.criteria.maxSilenceDuration) {
        silenceRemovals.push({
          title: `Remove ${gap.toFixed(1)}s silence`,
          startTime: current.end,
          endTime: next.start,
          duration: gap,
          confidence: 0.95,
          reason: `Silent gap of ${gap.toFixed(1)} seconds detected`,
          engagement: 0.8,
          sentiment: 'neutral',
          keywords: ['silence', 'pause'],
          type: 'silence_removal',
        });
      }
    }
    
    return silenceRemovals;
  }

  /**
   * Detect topic changes for chapter markers
   */
  private async detectTopicChanges(segments: TranscriptionSegment[]): Promise<ChapterMarker[]> {
    const chapters: ChapterMarker[] = [];
    const windowSize = 10; // Analyze 10 segments at a time
    
    for (let i = 0; i < segments.length - windowSize; i += windowSize) {
      const windowSegments = segments.slice(i, i + windowSize);
      const windowText = windowSegments.map(s => s.text).join(' ');
      const windowStart = windowSegments[0].start;
      const windowEnd = windowSegments[windowSegments.length - 1].end;
      
      const keywords = this.extractKeywords(windowText);
      const confidence = windowSegments.reduce((sum, s) => sum + s.confidence, 0) / windowSegments.length;
      
      // Look for topic transition indicators
      const hasTransitionWords = this.containsTopicTransition(windowText);
      const keywordDiversity = new Set(keywords).size;
      
      if (hasTransitionWords || keywordDiversity > 3) {
        const duration = windowEnd - windowStart;
        
        if (duration >= this.criteria.chapterMinLength) {
          chapters.push({
            title: this.generateChapterTitle(keywords),
            startTime: windowStart,
            endTime: windowEnd,
            summary: this.generateSummary(windowText),
            confidence: confidence * (hasTransitionWords ? 1.2 : 1.0),
            topicKeywords: keywords,
          });
        }
      }
    }
    
    return chapters;
  }

  // Helper methods for content analysis
  private containsLaughter(text: string): boolean {
    const laughterPatterns = [
      /\b(ha|ah|eh|oh)\b.*\b(ha|ah|eh|oh)\b/i,
      /lol|lmao|hehe|haha/i,
      /\blaughter\b/i,
      /\bfunny\b/i,
      /\bjoke\b/i,
    ];
    return laughterPatterns.some(pattern => pattern.test(text));
  }

  private containsApplause(text: string): boolean {
    const applausePatterns = [
      /\bapplause\b/i,
      /\bclapping\b/i,
      /\bcheer/i,
      /\bwow\b/i,
      /\bamazing\b/i,
      /\bbrilliant\b/i,
    ];
    return applausePatterns.some(pattern => pattern.test(text));
  }

  private containsEmphasis(text: string): boolean {
    const emphasisPatterns = [
      /\b(very|really|absolutely|definitely|certainly|extremely)\b/i,
      /\b(important|crucial|key|essential|critical)\b/i,
      /[!]{2,}/,
      /[A-Z]{3,}/,
    ];
    return emphasisPatterns.some(pattern => pattern.test(text));
  }

  private containsQuestion(text: string): boolean {
    return /\?/.test(text) || /\b(what|how|why|when|where|who|which)\b/i.test(text);
  }

  private containsTopicTransition(text: string): boolean {
    const transitionPatterns = [
      /\b(now|next|moving on|let's talk about|speaking of|another|also)\b/i,
      /\b(first|second|third|finally|in conclusion)\b/i,
      /\b(however|but|although|meanwhile|furthermore)\b/i,
    ];
    return transitionPatterns.some(pattern => pattern.test(text));
  }

  private findKeywords(text: string, keywords: string[]): string[] {
    const found: string[] = [];
    const lowerText = text.toLowerCase();
    
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        found.push(keyword);
      }
    }
    
    return found;
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - could be enhanced with NLP
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
      
    const stopWords = new Set(['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'said', 'each', 'which', 'their', 'would', 'there', 'could', 'other']);
    
    const keywords = words
      .filter(word => !stopWords.has(word))
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private analyzeSentiment(text: string): string {
    const positiveWords = ['great', 'good', 'amazing', 'wonderful', 'excellent', 'fantastic', 'love', 'best', 'awesome', 'brilliant'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disgusting', 'sad', 'angry', 'frustrated'];
    const excitedWords = ['excited', 'thrilled', 'incredible', 'unbelievable', 'wow', 'amazing', 'fantastic'];
    const emphaticWords = ['absolutely', 'definitely', 'certainly', 'really', 'very', 'extremely', 'totally'];
    
    const lowerText = text.toLowerCase();
    
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    const excitedCount = excitedWords.filter(word => lowerText.includes(word)).length;
    const emphaticCount = emphaticWords.filter(word => lowerText.includes(word)).length;
    
    if (excitedCount > 0) return 'excited';
    if (emphaticCount > 1) return 'emphatic';
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    
    return 'neutral';
  }

  private getSentimentConfidence(text: string, sentiment: string): number {
    // Simple confidence calculation based on sentiment indicators
    const words = text.split(/\s+/).length;
    const sentiment_indicators = this.countSentimentIndicators(text, sentiment);
    return Math.min(0.95, 0.5 + (sentiment_indicators / words) * 2);
  }

  private countSentimentIndicators(text: string, sentiment: string): number {
    const indicators = {
      positive: ['great', 'good', 'amazing', 'wonderful', 'excellent', 'fantastic', 'love', 'best', 'awesome', 'brilliant'],
      negative: ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disgusting', 'sad', 'angry', 'frustrated'],
      excited: ['excited', 'thrilled', 'incredible', 'unbelievable', 'wow', 'amazing', 'fantastic'],
      emphatic: ['absolutely', 'definitely', 'certainly', 'really', 'very', 'extremely', 'totally'],
    };
    
    const words = indicators[sentiment as keyof typeof indicators] || [];
    const lowerText = text.toLowerCase();
    
    return words.filter(word => lowerText.includes(word)).length;
  }

  private isGoodSocialContent(text: string): boolean {
    // Check if content is suitable for social media
    const hasEmphasis = this.containsEmphasis(text);
    const hasSentiment = this.analyzeSentiment(text) !== 'neutral';
    const hasQuestion = this.containsQuestion(text);
    const wordCount = text.split(/\s+/).length;
    
    return (hasEmphasis || hasSentiment || hasQuestion) && wordCount >= 20 && wordCount <= 100;
  }

  private calculateSocialEngagement(text: string): number {
    let engagement = 0.5; // Base engagement
    
    if (this.containsQuestion(text)) engagement += 0.2;
    if (this.containsEmphasis(text)) engagement += 0.15;
    if (this.analyzeSentiment(text) !== 'neutral') engagement += 0.15;
    
    return Math.min(1.0, engagement);
  }

  private generateTitle(text: string): string {
    // Extract the most meaningful part for title
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 'Highlight';
    
    const firstSentence = sentences[0].trim();
    if (firstSentence.length <= 60) return firstSentence;
    
    // Truncate to first meaningful phrase
    const words = firstSentence.split(/\s+/);
    let title = '';
    for (const word of words) {
      if (title.length + word.length + 1 > 50) break;
      title += (title ? ' ' : '') + word;
    }
    
    return title || 'Highlight';
  }

  private generateChapterTitle(keywords: string[]): string {
    if (keywords.length === 0) return 'Chapter';
    
    const title = keywords.slice(0, 3).join(', ');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  private generateSummary(text: string): string {
    // Simple extractive summary - take first and most important sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 2) return text;
    
    // Take first sentence and longest sentence as summary
    const firstSentence = sentences[0].trim();
    const longestSentence = sentences.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    ).trim();
    
    if (firstSentence === longestSentence) {
      return firstSentence;
    }
    
    return `${firstSentence}. ${longestSentence}`;
  }

  private removeOverlappingHighlights(highlights: HighlightSuggestion[]): HighlightSuggestion[] {
    const filtered: HighlightSuggestion[] = [];
    
    highlights.sort((a, b) => a.startTime - b.startTime);
    
    for (const highlight of highlights) {
      const hasOverlap = filtered.some(existing => 
        (highlight.startTime >= existing.startTime && highlight.startTime < existing.endTime) ||
        (highlight.endTime > existing.startTime && highlight.endTime <= existing.endTime) ||
        (highlight.startTime <= existing.startTime && highlight.endTime >= existing.endTime)
      );
      
      if (!hasOverlap) {
        filtered.push(highlight);
      }
    }
    
    return filtered;
  }

  /**
   * Save highlight suggestions to database
   */
  async saveHighlights(mediaFileId: string, highlights: HighlightSuggestion[]): Promise<void> {
    await prisma.highlight.createMany({
      data: highlights.map(highlight => ({
        mediaFileId,
        title: highlight.title,
        startTime: highlight.startTime,
        endTime: highlight.endTime,
        duration: highlight.duration,
        confidence: highlight.confidence,
        reason: highlight.reason,
        engagement: highlight.engagement,
        sentiment: highlight.sentiment,
        keywords: highlight.keywords.join(','),
        status: 'SUGGESTED',
      })),
    });
  }
}

export default HighlightGenerator;