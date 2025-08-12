import { PrismaClient } from '@prisma/client';
import { TranscriptionSegment } from '../transcription/whisperx';

const prisma = new PrismaClient();

export interface SummaryOptions {
  type: 'brief' | 'detailed' | 'bullet_points' | 'executive' | 'chapter';
  length: 'short' | 'medium' | 'long';
  focus?: 'key_points' | 'action_items' | 'insights' | 'quotes' | 'questions';
  includeTimestamps?: boolean;
  includeSpeakers?: boolean;
  keywordFilter?: string[];
  sentimentAnalysis?: boolean;
  extractQuotes?: boolean;
  generateActionItems?: boolean;
}

export interface SummaryResult {
  id: string;
  type: string;
  length: string;
  content: string;
  confidence: number;
  keyPoints: string[];
  actionItems: string[];
  insights: string[];
  quotes: Quote[];
  questions: string[];
  sentiment: SentimentAnalysis;
  keywords: KeywordAnalysis[];
  speakers: SpeakerInsight[];
  timestamp: Date;
  metadata: {
    wordCount: number;
    processingTime: number;
    sourceSegments: number;
    confidenceScore: number;
  };
}

export interface Quote {
  text: string;
  speaker?: string;
  timestamp: number;
  confidence: number;
  context: string;
  significance: number;
}

export interface SentimentAnalysis {
  overall: 'positive' | 'negative' | 'neutral' | 'mixed';
  confidence: number;
  emotions: {
    joy: number;
    anger: number;
    fear: number;
    surprise: number;
    sadness: number;
  };
  segments: Array<{
    timeRange: [number, number];
    sentiment: string;
    confidence: number;
  }>;
}

export interface KeywordAnalysis {
  keyword: string;
  frequency: number;
  importance: number;
  contexts: string[];
  speakers: string[];
  timeRanges: Array<[number, number]>;
}

export interface SpeakerInsight {
  speakerId: string;
  speakerName: string;
  totalDuration: number;
  dominance: number;
  keyTopics: string[];
  sentiment: string;
  questionCount: number;
  emphasisCount: number;
  averageConfidence: number;
}

export class SummaryGenerator {
  private readonly options: Required<SummaryOptions>;

  constructor(options: SummaryOptions) {
    this.options = {
      type: options.type || 'detailed',
      length: options.length || 'medium',
      focus: options.focus || 'key_points',
      includeTimestamps: options.includeTimestamps ?? false,
      includeSpeakers: options.includeSpeakers ?? false,
      keywordFilter: options.keywordFilter || [],
      sentimentAnalysis: options.sentimentAnalysis ?? true,
      extractQuotes: options.extractQuotes ?? true,
      generateActionItems: options.generateActionItems ?? true,
    };
  }

  /**
   * Generate summary from transcript
   */
  async generateSummary(transcriptId: string): Promise<SummaryResult> {
    const startTime = Date.now();

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
      },
    });

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    console.log(`Generating ${this.options.type} summary for transcript ${transcriptId}`);

    // Convert to our format
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

    // Generate all components
    const keyPoints = await this.extractKeyPoints(segments);
    const actionItems = this.options.generateActionItems ? await this.extractActionItems(segments) : [];
    const insights = await this.generateInsights(segments);
    const quotes = this.options.extractQuotes ? await this.extractSignificantQuotes(segments) : [];
    const questions = await this.extractQuestions(segments);
    const sentiment = this.options.sentimentAnalysis ? await this.analyzeSentiment(segments) : this.getEmptySentiment();
    const keywords = await this.analyzeKeywords(segments);
    const speakerInsights = await this.analyzeSpeakers(segments, transcript.speakers);

    // Generate main content based on type
    const content = await this.generateContent(segments, {
      keyPoints,
      actionItems,
      insights,
      quotes,
      questions,
      keywords,
    });

    const processingTime = (Date.now() - startTime) / 1000;

    // Calculate confidence score
    const averageSegmentConfidence = segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length;
    const contentQualityScore = this.assessContentQuality(content, keyPoints, insights);
    const confidenceScore = (averageSegmentConfidence + contentQualityScore) / 2;

    const result: SummaryResult = {
      id: `summary_${transcriptId}_${Date.now()}`,
      type: this.options.type,
      length: this.options.length,
      content,
      confidence: confidenceScore,
      keyPoints,
      actionItems,
      insights,
      quotes,
      questions,
      sentiment,
      keywords,
      speakers: speakerInsights,
      timestamp: new Date(),
      metadata: {
        wordCount: content.split(/\s+/).length,
        processingTime,
        sourceSegments: segments.length,
        confidenceScore,
      },
    };

    // Save to database
    await this.saveSummary(transcriptId, result);

    return result;
  }

  /**
   * Extract key points from segments
   */
  private async extractKeyPoints(segments: TranscriptionSegment[]): Promise<string[]> {
    const keyPoints: string[] = [];
    const sentenceGroups = this.groupIntoSentences(segments);

    for (const group of sentenceGroups) {
      const text = group.map(s => s.text).join(' ').trim();
      if (text.length < 20) continue;

      const importance = this.calculateImportance(text, group);
      
      if (importance > 0.6) {
        // Clean up and format the key point
        const cleanPoint = this.cleanText(text);
        if (cleanPoint.length > 10 && !keyPoints.some(existing => this.isSimilarText(existing, cleanPoint))) {
          keyPoints.push(cleanPoint);
        }
      }
    }

    // Sort by calculated importance and limit based on length preference
    const maxPoints = this.getMaxPoints();
    return keyPoints.slice(0, maxPoints);
  }

  /**
   * Extract action items from segments
   */
  private async extractActionItems(segments: TranscriptionSegment[]): Promise<string[]> {
    const actionItems: string[] = [];
    const fullText = segments.map(s => s.text).join(' ');

    const actionPatterns = [
      /(?:we need to|should|must|have to|going to|will|plan to|decide to) ([^.!?]{10,100})/gi,
      /(?:action item|to-do|task|assignment|follow up|next step)(?:[:\-\s]+)([^.!?]{5,80})/gi,
      /(?:let['']s|let us) ([^.!?]{10,80})/gi,
      /(?:i['']ll|we['']ll|you['']ll|they['']ll) ([^.!?]{10,80})/gi,
    ];

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(fullText)) !== null) {
        const actionItem = this.cleanText(match[1]);
        if (actionItem.length > 5 && !actionItems.some(existing => this.isSimilarText(existing, actionItem))) {
          actionItems.push(actionItem);
        }
      }
    }

    return actionItems.slice(0, 10); // Limit to 10 action items
  }

  /**
   * Generate insights from content analysis
   */
  private async generateInsights(segments: TranscriptionSegment[]): Promise<string[]> {
    const insights: string[] = [];
    const fullText = segments.map(s => s.text).join(' ');

    // Analyze topic transitions
    const topicChanges = this.detectTopicTransitions(segments);
    if (topicChanges.length > 2) {
      insights.push(`Discussion covers ${topicChanges.length} distinct topics with clear transitions`);
    }

    // Analyze discussion pattern
    const questionSegments = segments.filter(s => s.text.includes('?')).length;
    const totalSegments = segments.length;
    if (questionSegments > totalSegments * 0.1) {
      insights.push(`High engagement with ${Math.round((questionSegments/totalSegments) * 100)}% question-based interaction`);
    }

    // Analyze confidence patterns
    const lowConfidenceSegments = segments.filter(s => s.confidence < 0.6).length;
    if (lowConfidenceSegments > totalSegments * 0.2) {
      insights.push(`Audio quality concerns detected in ${Math.round((lowConfidenceSegments/totalSegments) * 100)}% of content`);
    }

    // Analyze content depth
    const avgSegmentLength = segments.reduce((sum, s) => sum + s.text.length, 0) / segments.length;
    if (avgSegmentLength > 100) {
      insights.push('In-depth discussion with detailed explanations');
    } else if (avgSegmentLength < 30) {
      insights.push('Fast-paced conversation with brief exchanges');
    }

    // Analyze emphasis and excitement
    const emphasisCount = this.countEmphasisIndicators(fullText);
    if (emphasisCount > 5) {
      insights.push('High emotional engagement with frequent emphasis and excitement');
    }

    return insights;
  }

  /**
   * Extract significant quotes
   */
  private async extractSignificantQuotes(segments: TranscriptionSegment[]): Promise<Quote[]> {
    const quotes: Quote[] = [];

    for (const segment of segments) {
      const text = segment.text.trim();
      if (text.length < 20 || text.length > 200) continue;

      const significance = this.calculateQuoteSignificance(text, segment);
      
      if (significance > 0.7) {
        quotes.push({
          text,
          speaker: segment.speaker?.name || segment.speaker?.label,
          timestamp: segment.start,
          confidence: segment.confidence,
          context: this.getContext(segment, segments),
          significance,
        });
      }
    }

    // Sort by significance and limit
    return quotes
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 5);
  }

  /**
   * Extract questions from segments
   */
  private async extractQuestions(segments: TranscriptionSegment[]): Promise<string[]> {
    const questions: string[] = [];

    for (const segment of segments) {
      const text = segment.text.trim();
      
      if (text.includes('?') || this.isQuestion(text)) {
        const cleanQuestion = this.cleanText(text);
        if (cleanQuestion.length > 5 && !questions.some(existing => this.isSimilarText(existing, cleanQuestion))) {
          questions.push(cleanQuestion);
        }
      }
    }

    return questions.slice(0, 10);
  }

  /**
   * Analyze sentiment across segments
   */
  private async analyzeSentiment(segments: TranscriptionSegment[]): Promise<SentimentAnalysis> {
    const segmentSentiments: Array<{ timeRange: [number, number]; sentiment: string; confidence: number; }> = [];
    let overallScores = { positive: 0, negative: 0, neutral: 0 };

    for (const segment of segments) {
      const sentiment = this.analyzeSingleSentiment(segment.text);
      segmentSentiments.push({
        timeRange: [segment.start, segment.end],
        sentiment: sentiment.label,
        confidence: sentiment.confidence,
      });
      
      overallScores[sentiment.label as keyof typeof overallScores] += sentiment.confidence;
    }

    const totalScore = overallScores.positive + overallScores.negative + overallScores.neutral;
    const normalizedScores = {
      positive: overallScores.positive / totalScore,
      negative: overallScores.negative / totalScore,
      neutral: overallScores.neutral / totalScore,
    };

    let overall: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
    let confidence = 0.5;

    if (normalizedScores.positive > 0.6) {
      overall = 'positive';
      confidence = normalizedScores.positive;
    } else if (normalizedScores.negative > 0.6) {
      overall = 'negative';
      confidence = normalizedScores.negative;
    } else if (normalizedScores.positive > 0.3 && normalizedScores.negative > 0.3) {
      overall = 'mixed';
      confidence = 1 - normalizedScores.neutral;
    }

    return {
      overall,
      confidence,
      emotions: {
        joy: normalizedScores.positive * 0.8,
        anger: normalizedScores.negative * 0.6,
        fear: normalizedScores.negative * 0.3,
        surprise: normalizedScores.positive * 0.4,
        sadness: normalizedScores.negative * 0.4,
      },
      segments: segmentSentiments,
    };
  }

  /**
   * Analyze keywords and their importance
   */
  private async analyzeKeywords(segments: TranscriptionSegment[]): Promise<KeywordAnalysis[]> {
    const wordFreq: Record<string, { 
      count: number; 
      contexts: string[]; 
      speakers: Set<string>; 
      timeRanges: Array<[number, number]>; 
    }> = {};

    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
      'so', 'very', 'just', 'now', 'then', 'here', 'there', 'when', 'where', 'why', 'how',
      'what', 'which', 'who', 'whom', 'whose', 'all', 'any', 'some', 'more', 'most', 'other'
    ]);

    for (const segment of segments) {
      const words = segment.text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));

      for (const word of words) {
        if (!wordFreq[word]) {
          wordFreq[word] = { 
            count: 0, 
            contexts: [], 
            speakers: new Set(), 
            timeRanges: [] 
          };
        }
        
        wordFreq[word].count++;
        wordFreq[word].contexts.push(segment.text.substring(0, 50) + '...');
        wordFreq[word].timeRanges.push([segment.start, segment.end]);
        
        if (segment.speaker) {
          wordFreq[word].speakers.add(segment.speaker.name || segment.speaker.label);
        }
      }
    }

    const keywords: KeywordAnalysis[] = Object.entries(wordFreq)
      .map(([keyword, data]) => ({
        keyword,
        frequency: data.count,
        importance: this.calculateKeywordImportance(data.count, segments.length),
        contexts: [...new Set(data.contexts)].slice(0, 3),
        speakers: Array.from(data.speakers),
        timeRanges: data.timeRanges,
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    return keywords;
  }

  /**
   * Analyze speaker patterns and insights
   */
  private async analyzeSpeakers(segments: TranscriptionSegment[], speakers: any[]): Promise<SpeakerInsight[]> {
    const insights: SpeakerInsight[] = [];
    const totalDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);

    for (const speaker of speakers) {
      const speakerSegments = segments.filter(s => s.speaker?.id === speaker.id);
      
      if (speakerSegments.length === 0) continue;

      const speakerText = speakerSegments.map(s => s.text).join(' ');
      const keyTopics = this.extractSpeakerTopics(speakerText);
      const sentiment = this.analyzeSingleSentiment(speakerText);
      const questionCount = speakerSegments.filter(s => s.text.includes('?')).length;
      const emphasisCount = this.countEmphasisIndicators(speakerText);

      insights.push({
        speakerId: speaker.id,
        speakerName: speaker.name || speaker.label,
        totalDuration: speaker.totalDuration,
        dominance: speaker.totalDuration / totalDuration,
        keyTopics,
        sentiment: sentiment.label,
        questionCount,
        emphasisCount,
        averageConfidence: speaker.averageConfidence,
      });
    }

    return insights.sort((a, b) => b.dominance - a.dominance);
  }

  /**
   * Generate main content based on type
   */
  private async generateContent(
    segments: TranscriptionSegment[], 
    components: {
      keyPoints: string[];
      actionItems: string[];
      insights: string[];
      quotes: Quote[];
      questions: string[];
      keywords: KeywordAnalysis[];
    }
  ): Promise<string> {
    const { keyPoints, actionItems, insights, quotes, questions } = components;

    switch (this.options.type) {
      case 'brief':
        return this.generateBriefSummary(keyPoints, insights);
      
      case 'bullet_points':
        return this.generateBulletPoints(keyPoints, actionItems, questions);
      
      case 'executive':
        return this.generateExecutiveSummary(keyPoints, insights, actionItems);
      
      case 'chapter':
        return this.generateChapterSummary(segments, keyPoints);
      
      default: // detailed
        return this.generateDetailedSummary(keyPoints, insights, actionItems, quotes, questions);
    }
  }

  private generateBriefSummary(keyPoints: string[], insights: string[]): string {
    const topPoints = keyPoints.slice(0, 3);
    const topInsights = insights.slice(0, 2);
    
    let summary = topPoints.join('. ') + '.';
    
    if (topInsights.length > 0) {
      summary += '\n\nKey insights: ' + topInsights.join('; ') + '.';
    }
    
    return summary;
  }

  private generateBulletPoints(keyPoints: string[], actionItems: string[], questions: string[]): string {
    let content = '**Key Points:**\n';
    keyPoints.slice(0, 5).forEach((point, i) => {
      content += `${i + 1}. ${point}\n`;
    });

    if (actionItems.length > 0) {
      content += '\n**Action Items:**\n';
      actionItems.slice(0, 5).forEach((item, i) => {
        content += `${i + 1}. ${item}\n`;
      });
    }

    if (questions.length > 0) {
      content += '\n**Key Questions:**\n';
      questions.slice(0, 3).forEach((question, i) => {
        content += `${i + 1}. ${question}\n`;
      });
    }

    return content;
  }

  private generateExecutiveSummary(keyPoints: string[], insights: string[], actionItems: string[]): string {
    let summary = '**Executive Summary**\n\n';
    
    summary += keyPoints.slice(0, 3).join('. ') + '.\n\n';
    
    if (insights.length > 0) {
      summary += '**Strategic Insights:**\n';
      insights.slice(0, 3).forEach(insight => {
        summary += `• ${insight}\n`;
      });
      summary += '\n';
    }

    if (actionItems.length > 0) {
      summary += '**Recommended Actions:**\n';
      actionItems.slice(0, 5).forEach(item => {
        summary += `• ${item}\n`;
      });
    }

    return summary;
  }

  private generateChapterSummary(segments: TranscriptionSegment[], keyPoints: string[]): string {
    const duration = segments[segments.length - 1]?.end - segments[0]?.start;
    const minutes = Math.round(duration / 60);
    
    let summary = `**Chapter Summary** (${minutes} minutes)\n\n`;
    summary += keyPoints.slice(0, 4).join('. ') + '.\n\n';
    
    if (this.options.includeTimestamps) {
      summary += '**Key Moments:**\n';
      const importantSegments = segments
        .filter(s => this.calculateImportance(s.text, [s]) > 0.7)
        .slice(0, 3);
        
      importantSegments.forEach(segment => {
        const timestamp = this.formatTimestamp(segment.start);
        summary += `• [${timestamp}] ${segment.text}\n`;
      });
    }
    
    return summary;
  }

  private generateDetailedSummary(
    keyPoints: string[], 
    insights: string[], 
    actionItems: string[], 
    quotes: Quote[], 
    questions: string[]
  ): string {
    let summary = '**Detailed Summary**\n\n';
    
    // Main content
    summary += keyPoints.slice(0, this.getMaxPoints()).join('. ') + '.\n\n';
    
    // Insights section
    if (insights.length > 0) {
      summary += '**Key Insights:**\n';
      insights.forEach(insight => {
        summary += `• ${insight}\n`;
      });
      summary += '\n';
    }

    // Notable quotes
    if (quotes.length > 0) {
      summary += '**Notable Quotes:**\n';
      quotes.slice(0, 3).forEach(quote => {
        const speaker = quote.speaker ? ` - ${quote.speaker}` : '';
        const timestamp = this.options.includeTimestamps ? ` [${this.formatTimestamp(quote.timestamp)}]` : '';
        summary += `• "${quote.text}"${speaker}${timestamp}\n`;
      });
      summary += '\n';
    }

    // Action items
    if (actionItems.length > 0) {
      summary += '**Action Items:**\n';
      actionItems.forEach(item => {
        summary += `• ${item}\n`;
      });
      summary += '\n';
    }

    // Questions raised
    if (questions.length > 0) {
      summary += '**Questions Raised:**\n';
      questions.slice(0, 5).forEach(question => {
        summary += `• ${question}\n`;
      });
    }

    return summary;
  }

  // Helper methods
  private groupIntoSentences(segments: TranscriptionSegment[]): TranscriptionSegment[][] {
    const groups: TranscriptionSegment[][] = [];
    let currentGroup: TranscriptionSegment[] = [];

    for (const segment of segments) {
      currentGroup.push(segment);
      
      // End group on sentence-ending punctuation or speaker change
      if (segment.text.match(/[.!?]$/) || currentGroup.length >= 3) {
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
          currentGroup = [];
        }
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private calculateImportance(text: string, segments: TranscriptionSegment[]): number {
    let importance = 0.3; // Base importance

    // Length factor
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 10 && wordCount < 50) importance += 0.2;

    // Confidence factor
    const avgConfidence = segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length;
    importance += avgConfidence * 0.3;

    // Content indicators
    if (this.containsKeyIndicators(text)) importance += 0.3;
    if (this.containsEmphasis(text)) importance += 0.2;
    if (this.containsNumbers(text)) importance += 0.1;

    return Math.min(1.0, importance);
  }

  private calculateQuoteSignificance(text: string, segment: TranscriptionSegment): number {
    let significance = segment.confidence * 0.4;

    // Content quality
    if (this.containsKeyIndicators(text)) significance += 0.3;
    if (this.containsEmphasis(text)) significance += 0.2;
    if (this.isInsightful(text)) significance += 0.3;

    // Length consideration
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 30) significance += 0.1;

    return Math.min(1.0, significance);
  }

  private containsKeyIndicators(text: string): boolean {
    const indicators = [
      'important', 'key', 'crucial', 'essential', 'critical', 'significant',
      'main', 'primary', 'fundamental', 'core', 'central', 'major'
    ];
    const lowerText = text.toLowerCase();
    return indicators.some(indicator => lowerText.includes(indicator));
  }

  private containsEmphasis(text: string): boolean {
    return /[!]{1,}|[A-Z]{3,}|\b(very|really|absolutely|extremely|incredibly)\b/i.test(text);
  }

  private containsNumbers(text: string): boolean {
    return /\d/.test(text);
  }

  private isInsightful(text: string): boolean {
    const insightWords = ['because', 'therefore', 'however', 'although', 'despite', 'since', 'due to'];
    const lowerText = text.toLowerCase();
    return insightWords.some(word => lowerText.includes(word));
  }

  private isQuestion(text: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
    const lowerText = text.toLowerCase().trim();
    return questionWords.some(word => lowerText.startsWith(word)) || text.includes('?');
  }

  private detectTopicTransitions(segments: TranscriptionSegment[]): string[] {
    const topics: string[] = [];
    const windowSize = 5;

    for (let i = 0; i < segments.length - windowSize; i += windowSize) {
      const windowText = segments.slice(i, i + windowSize).map(s => s.text).join(' ');
      const keywords = this.extractTopicKeywords(windowText);
      
      if (keywords.length > 0) {
        topics.push(keywords[0]);
      }
    }

    return [...new Set(topics)];
  }

  private extractTopicKeywords(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4)
      .slice(0, 3);
  }

  private extractSpeakerTopics(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4);
      
    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);
  }

  private countEmphasisIndicators(text: string): number {
    const patterns = [
      /[!]{1,}/g,
      /[A-Z]{3,}/g,
      /\b(very|really|absolutely|extremely|incredibly)\b/gi,
    ];

    return patterns.reduce((count, pattern) => {
      const matches = text.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  private analyzeSingleSentiment(text: string): { label: string; confidence: number } {
    const positiveWords = ['great', 'good', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 'awesome'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'sad', 'angry', 'frustrated'];
    
    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    
    if (positiveCount > negativeCount) {
      return { label: 'positive', confidence: Math.min(0.9, 0.5 + positiveCount * 0.2) };
    } else if (negativeCount > positiveCount) {
      return { label: 'negative', confidence: Math.min(0.9, 0.5 + negativeCount * 0.2) };
    }
    
    return { label: 'neutral', confidence: 0.7 };
  }

  private calculateKeywordImportance(frequency: number, totalSegments: number): number {
    const relativeFreq = frequency / totalSegments;
    return Math.min(1.0, relativeFreq * 10); // Scale up relative frequency
  }

  private getContext(segment: TranscriptionSegment, allSegments: TranscriptionSegment[]): string {
    const index = allSegments.indexOf(segment);
    const beforeIndex = Math.max(0, index - 1);
    const afterIndex = Math.min(allSegments.length - 1, index + 1);
    
    const before = index > 0 ? allSegments[beforeIndex].text : '';
    const after = index < allSegments.length - 1 ? allSegments[afterIndex].text : '';
    
    return `${before} [${segment.text}] ${after}`.trim();
  }

  private getMaxPoints(): number {
    switch (this.options.length) {
      case 'short': return 3;
      case 'medium': return 5;
      case 'long': return 8;
      default: return 5;
    }
  }

  private getEmptySentiment(): SentimentAnalysis {
    return {
      overall: 'neutral',
      confidence: 0,
      emotions: { joy: 0, anger: 0, fear: 0, surprise: 0, sadness: 0 },
      segments: [],
    };
  }

  private cleanText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[^\w]+|[^\w]+$/g, '');
  }

  private isSimilarText(text1: string, text2: string): boolean {
    const similarity = this.calculateSimilarity(text1.toLowerCase(), text2.toLowerCase());
    return similarity > 0.8;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private assessContentQuality(content: string, keyPoints: string[], insights: string[]): number {
    let quality = 0.5;
    
    const wordCount = content.split(/\s+/).length;
    if (wordCount > 100) quality += 0.1;
    if (wordCount > 300) quality += 0.1;
    
    if (keyPoints.length >= 3) quality += 0.1;
    if (insights.length >= 2) quality += 0.1;
    
    if (content.includes('**')) quality += 0.1; // Formatted content
    
    return Math.min(1.0, quality);
  }

  /**
   * Save summary to database
   */
  private async saveSummary(transcriptId: string, summary: SummaryResult): Promise<void> {
    await prisma.summary.create({
      data: {
        transcriptId,
        type: summary.type,
        length: summary.length,
        content: summary.content,
        confidence: summary.confidence,
        model: 'highlight-generator-v1',
        promptVersion: '1.0',
      },
    });
  }
}

export default SummaryGenerator;