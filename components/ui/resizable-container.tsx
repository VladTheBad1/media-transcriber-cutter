'use client'

import React, { useState, useRef, useEffect } from 'react'

interface ResizableContainerProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  initialWidth?: number
  initialHeight?: number
  resizeDirections?: ('top' | 'right' | 'bottom' | 'left' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight')[]
  onResize?: (width: number, height: number) => void
  borderColor?: string
  id?: string
  draggable?: boolean
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

export function ResizableContainer({
  children,
  className = '',
  style = {},
  minWidth = 50,
  maxWidth = 2000,
  minHeight = 30,
  maxHeight = 2000,
  initialWidth,
  initialHeight,
  resizeDirections = ['right', 'bottom', 'bottomRight'],
  onResize,
  borderColor,
  id,
  draggable = false,
  onDragOver,
  onDragLeave,
  onDrop
}: ResizableContainerProps) {
  const [isSelected, setIsSelected] = useState(false)
  const [dimensions, setDimensions] = useState({
    width: initialWidth || 'auto',
    height: initialHeight || 'auto'
  })
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const startPos = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })
  
  // Load saved dimensions from localStorage after mount
  useEffect(() => {
    if (!id || typeof window === 'undefined') return
    
    const saved = localStorage.getItem(`container-size-${id}`)
    if (saved) {
      try {
        const savedDimensions = JSON.parse(saved)
        setDimensions(savedDimensions)
      } catch (e) {
        console.error(`Failed to parse saved dimensions for ${id}:`, e)
      }
    }
  }, [id])
  
  // Listen for save layout event
  useEffect(() => {
    if (!id || typeof window === 'undefined') return
    
    const handleSaveLayout = () => {
      const currentDimensions = { width: dimensions.width, height: dimensions.height }
      localStorage.setItem(`container-size-${id}`, JSON.stringify(currentDimensions))
    }
    
    window.addEventListener('save-layout', handleSaveLayout)
    return () => window.removeEventListener('save-layout', handleSaveLayout)
  }, [id, dimensions])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsSelected(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + Click to select nested containers
      if (e.key === 'Escape') {
        setIsSelected(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent, direction: string) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setResizeDirection(direction)
    
    const rect = containerRef.current?.getBoundingClientRect()
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect?.width || 300,
      height: rect?.height || 200
    }
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeDirection) return

      const deltaX = e.clientX - startPos.current.x
      const deltaY = e.clientY - startPos.current.y
      let newWidth = startPos.current.width
      let newHeight = startPos.current.height

      if (resizeDirection.includes('right')) {
        newWidth = Math.min(maxWidth, Math.max(minWidth, startPos.current.width + deltaX))
      }
      if (resizeDirection.includes('left')) {
        newWidth = Math.min(maxWidth, Math.max(minWidth, startPos.current.width - deltaX))
      }
      if (resizeDirection.includes('bottom')) {
        newHeight = Math.min(maxHeight, Math.max(minHeight, startPos.current.height + deltaY))
      }
      if (resizeDirection.includes('top')) {
        newHeight = Math.min(maxHeight, Math.max(minHeight, startPos.current.height - deltaY))
      }

      const newDimensions = { width: newWidth, height: newHeight }
      setDimensions(newDimensions)
      onResize?.(newWidth, newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeDirection(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, resizeDirection, maxWidth, minWidth, maxHeight, minHeight, onResize])

  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    // Deselect other containers when selecting this one
    const allContainers = document.querySelectorAll('[data-resizable-container]')
    allContainers.forEach(container => {
      if (container !== containerRef.current) {
        // This will be handled by the global click outside handler
      }
    })
    
    setIsSelected(true)
  }

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    // Start dragging if holding Shift key
    if (e.shiftKey && isSelected) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      startPos.current.x = e.clientX
      startPos.current.y = e.clientY
      startPos.current.posX = position.x
      startPos.current.posY = position.y
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPos.current.x
      const deltaY = e.clientY - startPos.current.y
      
      setPosition({
        x: startPos.current.posX + deltaX,
        y: startPos.current.posY + deltaY
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <div
      ref={containerRef}
      data-resizable-container="true"
      className={`relative ${className} ${isSelected ? 'z-50' : ''} ${isDragging ? 'cursor-move' : ''}`}
      style={{
        ...style,
        width: typeof dimensions.width === 'number' ? `${dimensions.width}px` : dimensions.width,
        height: typeof dimensions.height === 'number' ? `${dimensions.height}px` : dimensions.height,
        border: borderColor ? `3px solid ${borderColor}` : style.border,
        outline: isSelected ? '2px solid cyan' : 'none',
        outlineOffset: '2px',
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: isDragging ? 'none' : 'transform 0.1s ease'
      }}
      onClick={handleContainerClick}
      onMouseDown={handleContainerMouseDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      id={id}
    >
      {children}
      
      {/* Move indicator when selected */}
      {isSelected && (
        <div className="absolute top-2 left-2 text-xs text-cyan-400 bg-gray-900/80 px-2 py-1 rounded pointer-events-none">
          Hold Shift + Drag to move
        </div>
      )}
      
      {/* Resize handles - only show when selected */}
      {isSelected && (
        <>
          {/* Corner handles */}
          {resizeDirections.includes('topLeft') && (
            <div
              className="absolute -top-2 -left-2 w-4 h-4 bg-cyan-500 cursor-nw-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'topLeft')}
            />
          )}
          {resizeDirections.includes('topRight') && (
            <div
              className="absolute -top-2 -right-2 w-4 h-4 bg-cyan-500 cursor-ne-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'topRight')}
            />
          )}
          {resizeDirections.includes('bottomLeft') && (
            <div
              className="absolute -bottom-2 -left-2 w-4 h-4 bg-cyan-500 cursor-sw-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'bottomLeft')}
            />
          )}
          {resizeDirections.includes('bottomRight') && (
            <div
              className="absolute -bottom-2 -right-2 w-4 h-4 bg-cyan-500 cursor-se-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'bottomRight')}
            />
          )}
          
          {/* Edge handles */}
          {resizeDirections.includes('top') && (
            <div
              className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-16 h-3 bg-cyan-500 cursor-n-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'top')}
            />
          )}
          {resizeDirections.includes('right') && (
            <div
              className="absolute -right-2 top-1/2 transform -translate-y-1/2 w-3 h-16 bg-cyan-500 cursor-e-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
            />
          )}
          {resizeDirections.includes('bottom') && (
            <div
              className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-16 h-3 bg-cyan-500 cursor-s-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'bottom')}
            />
          )}
          {resizeDirections.includes('left') && (
            <div
              className="absolute -left-2 top-1/2 transform -translate-y-1/2 w-3 h-16 bg-cyan-500 cursor-w-resize hover:bg-cyan-400"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
            />
          )}
        </>
      )}
    </div>
  )
}