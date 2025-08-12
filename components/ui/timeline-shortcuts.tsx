'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card'
import { Button } from './button'
import { Badge } from './badge'
import { 
  Keyboard, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Scissors, 
  Copy, 
  Trash2, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface TimelineShortcut {
  category: string
  shortcuts: {
    keys: string[]
    description: string
    icon?: React.ReactNode
  }[]
}

const timelineShortcuts: TimelineShortcut[] = [
  {
    category: 'Playback Control',
    shortcuts: [
      {
        keys: ['Space'],
        description: 'Play/Pause',
        icon: <Play className="w-3 h-3" />
      },
      {
        keys: ['J'],
        description: 'Play backwards',
        icon: <SkipBack className="w-3 h-3" />
      },
      {
        keys: ['K'],
        description: 'Pause',
        icon: <Pause className="w-3 h-3" />
      },
      {
        keys: ['L'],
        description: 'Play forwards',
        icon: <SkipForward className="w-3 h-3" />
      },
      {
        keys: ['Shift', 'L'],
        description: 'Play fast forward (2x)',
        icon: <SkipForward className="w-3 h-3" />
      }
    ]
  },
  {
    category: 'Navigation',
    shortcuts: [
      {
        keys: ['←'],
        description: 'Step backward 1 second'
      },
      {
        keys: ['→'],
        description: 'Step forward 1 second'
      },
      {
        keys: ['Shift', '←'],
        description: 'Step backward 10 seconds'
      },
      {
        keys: ['Shift', '→'],
        description: 'Step forward 10 seconds'
      },
      {
        keys: ['Ctrl', '←'],
        description: 'Step backward 1 frame'
      },
      {
        keys: ['Ctrl', '→'],
        description: 'Step forward 1 frame'
      },
      {
        keys: ['Home'],
        description: 'Go to beginning'
      },
      {
        keys: ['End'],
        description: 'Go to end'
      }
    ]
  },
  {
    category: 'Editing Operations',
    shortcuts: [
      {
        keys: ['S'],
        description: 'Split clip at playhead',
        icon: <Scissors className="w-3 h-3" />
      },
      {
        keys: ['Ctrl', 'S'],
        description: 'Split selected clips at playhead',
        icon: <Scissors className="w-3 h-3" />
      },
      {
        keys: ['Delete'],
        description: 'Delete selected clips',
        icon: <Trash2 className="w-3 h-3" />
      },
      {
        keys: ['Backspace'],
        description: 'Delete selected clips',
        icon: <Trash2 className="w-3 h-3" />
      },
      {
        keys: ['Ctrl', 'C'],
        description: 'Copy selected clips',
        icon: <Copy className="w-3 h-3" />
      },
      {
        keys: ['Ctrl', 'V'],
        description: 'Paste clips at playhead'
      },
      {
        keys: ['Ctrl', 'D'],
        description: 'Duplicate selected clips'
      }
    ]
  },
  {
    category: 'Selection',
    shortcuts: [
      {
        keys: ['Ctrl', 'A'],
        description: 'Select all clips'
      },
      {
        keys: ['Ctrl', 'Click'],
        description: 'Add clip to selection'
      },
      {
        keys: ['Shift', 'Click'],
        description: 'Select range of clips'
      },
      {
        keys: ['Esc'],
        description: 'Clear selection'
      }
    ]
  },
  {
    category: 'View Controls',
    shortcuts: [
      {
        keys: ['+'],
        description: 'Zoom in',
        icon: <ZoomIn className="w-3 h-3" />
      },
      {
        keys: ['-'],
        description: 'Zoom out',
        icon: <ZoomOut className="w-3 h-3" />
      },
      {
        keys: ['Ctrl', '0'],
        description: 'Fit timeline to view'
      },
      {
        keys: ['Ctrl', '1'],
        description: 'Zoom to 100%'
      }
    ]
  },
  {
    category: 'History',
    shortcuts: [
      {
        keys: ['Ctrl', 'Z'],
        description: 'Undo last action',
        icon: <RotateCcw className="w-3 h-3" />
      },
      {
        keys: ['Ctrl', 'Shift', 'Z'],
        description: 'Redo last undone action',
        icon: <RotateCcw className="w-3 h-3 scale-x-[-1]" />
      },
      {
        keys: ['Ctrl', 'Y'],
        description: 'Redo last undone action',
        icon: <RotateCcw className="w-3 h-3 scale-x-[-1]" />
      }
    ]
  },
  {
    category: 'Save & Export',
    shortcuts: [
      {
        keys: ['Ctrl', 'S'],
        description: 'Save timeline'
      },
      {
        keys: ['Ctrl', 'Shift', 'E'],
        description: 'Export timeline'
      }
    ]
  }
]

interface TimelineShortcutsProps {
  className?: string
  compact?: boolean
}

export const TimelineShortcuts: React.FC<TimelineShortcutsProps> = ({ 
  className, 
  compact = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(!compact)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    compact ? new Set() : new Set(timelineShortcuts.map(s => s.category))
  )

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const renderShortcutKeys = (keys: string[]) => (
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <React.Fragment key={key}>
          {index > 0 && <span className="text-xs text-gray-500">+</span>}
          <kbd className="inline-flex items-center px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  )

  if (compact && !isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className={`flex items-center gap-2 ${className}`}
      >
        <Keyboard className="w-4 h-4" />
        Shortcuts
      </Button>
    )
  }

  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">Timeline Keyboard Shortcuts</CardTitle>
          </div>
          {compact && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <CardDescription>
          Master these shortcuts for efficient timeline editing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {timelineShortcuts.map((category, categoryIndex) => {
            const isExpanded = expandedCategories.has(category.category)
            
            return (
              <div key={category.category} className="border rounded-lg p-3">
                <button
                  onClick={() => toggleCategory(category.category)}
                  className="flex items-center justify-between w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800 p-2 -m-2 rounded transition-colors"
                >
                  <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    {category.category}
                    <Badge variant="secondary" className="text-xs">
                      {category.shortcuts.length}
                    </Badge>
                  </h4>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                
                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {category.shortcuts.map((shortcut, shortcutIndex) => (
                      <div
                        key={shortcutIndex}
                        className="flex items-center justify-between py-2 px-1"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          {shortcut.icon && (
                            <div className="text-gray-400">
                              {shortcut.icon}
                            </div>
                          )}
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {shortcut.description}
                          </span>
                        </div>
                        <div className="ml-4">
                          {renderShortcutKeys(shortcut.keys)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          
          {/* Quick Tips */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-sm text-blue-900 dark:text-blue-100 mb-2">
              💡 Pro Tips
            </h5>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Hold <kbd className="px-1 text-xs bg-blue-100 dark:bg-blue-800 rounded">Shift</kbd> with arrow keys for larger steps</li>
              <li>• Use <kbd className="px-1 text-xs bg-blue-100 dark:bg-blue-800 rounded">Ctrl</kbd> with arrow keys for frame-accurate editing</li>
              <li>• Drag clip edges to trim, drag clip body to move</li>
              <li>• Double-click clips to select and edit properties</li>
              <li>• Right-click for context menu with additional options</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Compact floating shortcuts panel
export const TimelineShortcutsPanel: React.FC<{
  onClose?: () => void
}> = ({ onClose }) => {
  return (
    <div className="fixed top-4 right-4 z-50 w-96 max-h-[80vh] overflow-y-auto">
      <TimelineShortcuts compact={true} />
    </div>
  )
}

// Hook for keyboard shortcut detection
export const useKeyboardShortcuts = (callbacks: {
  onPlayPause?: () => void
  onStepBackward?: () => void
  onStepForward?: () => void
  onSplitAtPlayhead?: () => void
  onDeleteSelected?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onSelectAll?: () => void
  onClearSelection?: () => void
  onSave?: () => void
}) => {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const isCtrl = e.ctrlKey || e.metaKey
      const isShift = e.shiftKey
      const key = e.key.toLowerCase()

      // Prevent default for handled shortcuts
      const preventDefault = () => {
        e.preventDefault()
        e.stopPropagation()
      }

      switch (key) {
        case ' ':
          preventDefault()
          callbacks.onPlayPause?.()
          break
        
        case 'j':
          preventDefault()
          // Implement reverse playback
          break
        
        case 'k':
          preventDefault()
          callbacks.onPlayPause?.()
          break
        
        case 'l':
          preventDefault()
          // Implement forward playback
          break
        
        case 'arrowleft':
          preventDefault()
          callbacks.onStepBackward?.()
          break
        
        case 'arrowright':
          preventDefault()
          callbacks.onStepForward?.()
          break
        
        case 's':
          if (isCtrl) {
            preventDefault()
            if (isShift) {
              // Export
            } else {
              callbacks.onSave?.()
            }
          } else {
            preventDefault()
            callbacks.onSplitAtPlayhead?.()
          }
          break
        
        case 'delete':
        case 'backspace':
          preventDefault()
          callbacks.onDeleteSelected?.()
          break
        
        case 'c':
          if (isCtrl) {
            preventDefault()
            callbacks.onCopy?.()
          }
          break
        
        case 'v':
          if (isCtrl) {
            preventDefault()
            callbacks.onPaste?.()
          }
          break
        
        case 'z':
          if (isCtrl) {
            preventDefault()
            if (isShift) {
              callbacks.onRedo?.()
            } else {
              callbacks.onUndo?.()
            }
          }
          break
        
        case 'y':
          if (isCtrl) {
            preventDefault()
            callbacks.onRedo?.()
          }
          break
        
        case 'a':
          if (isCtrl) {
            preventDefault()
            callbacks.onSelectAll?.()
          }
          break
        
        case 'escape':
          preventDefault()
          callbacks.onClearSelection?.()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [callbacks])
}

export default TimelineShortcuts
