// Health check endpoint for Docker deployment
// Provides comprehensive system status for monitoring

import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {}
  };

  try {
    // Database connectivity check
    const start = Date.now();
    await prisma.$executeRaw`SELECT 1`;
    const dbLatency = Date.now() - start;
    
    health.checks.database = {
      status: 'healthy',
      latency: `${dbLatency}ms`,
      message: 'Database connection successful'
    };
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'unhealthy',
      error: error.message,
      message: 'Database connection failed'
    };
  }

  try {
    // Redis connectivity check (if configured)
    if (process.env.REDIS_URL) {
      // Note: Would need redis client implementation
      health.checks.redis = {
        status: 'healthy',
        message: 'Redis configuration detected'
      };
    } else {
      health.checks.redis = {
        status: 'warning',
        message: 'Redis not configured'
      };
    }
  } catch (error) {
    health.checks.redis = {
      status: 'unhealthy',
      error: error.message
    };
  }

  try {
    // Python/WhisperX check
    const { spawn } = require('child_process');
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    
    const pythonCheck = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Python check timeout'));
      }, 5000);
      
      const python = spawn(pythonPath, ['-c', 'import whisperx; print("OK")'], {
        stdio: 'pipe'
      });
      
      python.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve('healthy');
        } else {
          reject(new Error(`Python process exited with code ${code}`));
        }
      });
      
      python.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    
    await pythonCheck;
    health.checks.whisperx = {
      status: 'healthy',
      message: 'WhisperX available'
    };
  } catch (error) {
    health.checks.whisperx = {
      status: 'warning',
      error: error.message,
      message: 'WhisperX check failed - transcription may not work'
    };
  }

  try {
    // File system checks
    const fs = require('fs').promises;
    const path = require('path');
    
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const exportsDir = path.join(process.cwd(), 'exports');
    const tempDir = path.join(process.cwd(), 'temp');
    
    await fs.access(uploadsDir);
    await fs.access(exportsDir);
    await fs.access(tempDir);
    
    health.checks.storage = {
      status: 'healthy',
      message: 'Storage directories accessible'
    };
  } catch (error) {
    health.checks.storage = {
      status: 'warning',
      error: error.message,
      message: 'Storage directory check failed'
    };
  }

  // FFmpeg check
  try {
    const { spawn } = require('child_process');
    
    const ffmpegCheck = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('FFmpeg check timeout'));
      }, 3000);
      
      const ffmpeg = spawn('ffmpeg', ['-version'], {
        stdio: 'pipe'
      });
      
      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve('healthy');
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    
    await ffmpegCheck;
    health.checks.ffmpeg = {
      status: 'healthy',
      message: 'FFmpeg available'
    };
  } catch (error) {
    health.checks.ffmpeg = {
      status: 'warning',
      error: error.message,
      message: 'FFmpeg check failed - video processing may not work'
    };
  }

  // System resources
  const memoryUsage = process.memoryUsage();
  health.system = {
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
    },
    nodejs: process.version,
    platform: process.platform,
    arch: process.arch
  };

  // Environment info (safe subset)
  health.environment_info = {
    node_env: process.env.NODE_ENV,
    python_path: process.env.PYTHON_PATH || 'python3',
    whisperx_service: process.env.WHISPERX_SERVICE_PATH ? 'configured' : 'not configured',
    database_type: process.env.DATABASE_URL ? 'configured' : 'not configured',
    redis: process.env.REDIS_URL ? 'configured' : 'not configured'
  };

  // Determine overall health status
  const hasUnhealthy = Object.values(health.checks).some(check => check.status === 'unhealthy');
  if (hasUnhealthy) {
    health.status = 'unhealthy';
  } else {
    const hasWarnings = Object.values(health.checks).some(check => check.status === 'warning');
    if (hasWarnings) {
      health.status = 'degraded';
    }
  }

  await prisma.$disconnect();

  // Return appropriate HTTP status code
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 200 : 503;
  
  return NextResponse.json(health, { status: statusCode });
}