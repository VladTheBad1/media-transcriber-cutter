import { BrowserMediaProcessor } from '@/lib/media/browser';

/**
 * Legacy function - now uses FFmpeg.wasm for better quality and format support
 * @deprecated Use BrowserMediaProcessor directly for better performance
 */
export const extractThumbnail = async (file: File, timestamp: number = 1): Promise<File> => {
    try {
        const processor = new BrowserMediaProcessor();
        const thumbnailBlob = await processor.generateThumbnail(file, timestamp, {
            width: 320,
            height: 240
        });
        
        return new File(
            [thumbnailBlob],
            `${file.name.split(".")[0]}_thumb.jpg`,
            { type: "image/jpeg" }
        );
    } catch (error) {
        // Fallback to canvas-based extraction if FFmpeg.wasm fails
        return extractThumbnailCanvas(file, timestamp);
    }
};

/**
 * Canvas-based thumbnail extraction (fallback method)
 */
export const extractThumbnailCanvas = (file: File, timestamp: number = 1): Promise<File> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.preload = "metadata";

        video.addEventListener("loadedmetadata", () => {
            // Ensure timestamp is within video duration
            const seekTime = Math.min(timestamp, video.duration - 0.1);
            video.currentTime = seekTime;
        });

        video.addEventListener("seeked", () => {
            try {
                const canvas = document.createElement("canvas");
                const aspectRatio = video.videoWidth / video.videoHeight;
                
                // Set canvas dimensions maintaining aspect ratio
                if (aspectRatio > 1) {
                    canvas.width = 320;
                    canvas.height = 320 / aspectRatio;
                } else {
                    canvas.width = 240 * aspectRatio;
                    canvas.height = 240;
                }

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    URL.revokeObjectURL(video.src);
                    return reject(new Error("Could not get canvas context"));
                }

                // Draw video frame to canvas
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(video.src);
                    
                    if (blob) {
                        const thumbnailFile = new File(
                            [blob],
                            `${file.name.split(".")[0]}_thumb.jpg`,
                            { type: "image/jpeg" }
                        );
                        resolve(thumbnailFile);
                    } else {
                        reject(new Error("Could not create thumbnail blob"));
                    }
                }, "image/jpeg", 0.8); // 80% quality
            } catch (error) {
                URL.revokeObjectURL(video.src);
                reject(error);
            }
        });

        video.addEventListener("error", () => {
            URL.revokeObjectURL(video.src);
            reject(new Error("Error loading video"));
        });
    });
};

/**
 * Extract multiple thumbnails at different timestamps
 */
export const extractMultipleThumbnails = async (
    file: File, 
    timestamps: number[]
): Promise<File[]> => {
    const processor = new BrowserMediaProcessor();
    const thumbnails: File[] = [];
    
    for (const timestamp of timestamps) {
        try {
            const thumbnailBlob = await processor.generateThumbnail(file, timestamp);
            const thumbnailFile = new File(
                [thumbnailBlob],
                `${file.name.split(".")[0]}_thumb_${timestamp}s.jpg`,
                { type: "image/jpeg" }
            );
            thumbnails.push(thumbnailFile);
        } catch (error) {
            console.warn(`Failed to extract thumbnail at ${timestamp}s:`, error);
        }
    }
    
    return thumbnails;
};

/**
 * Get video metadata for thumbnail generation
 */
export const getVideoMetadata = (file: File): Promise<{
    duration: number;
    width: number;
    height: number;
    aspectRatio: number;
}> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.preload = "metadata";
        
        video.addEventListener("loadedmetadata", () => {
            const metadata = {
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
                aspectRatio: video.videoWidth / video.videoHeight
            };
            
            URL.revokeObjectURL(video.src);
            resolve(metadata);
        });
        
        video.addEventListener("error", () => {
            URL.revokeObjectURL(video.src);
            reject(new Error("Error loading video metadata"));
        });
    });
};
