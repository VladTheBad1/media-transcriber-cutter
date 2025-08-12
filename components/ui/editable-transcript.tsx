"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface EditableTranscriptProps {
  segmentId: string;
  text: string;
  isActive: boolean;
  searchTerm?: string;
  onTextChange?: (segmentId: string, newText: string) => void;
  className?: string;
}

export const EditableTranscript: React.FC<EditableTranscriptProps> = ({
  segmentId,
  text,
  isActive,
  searchTerm,
  onTextChange,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(text);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setEditedText(text);
  }, [text]);

  // Auto-save with debouncing
  useEffect(() => {
    if (editedText !== text && !isEditing) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for auto-save
      saveTimeoutRef.current = setTimeout(() => {
        handleSave();
      }, 1000); // Save after 1 second of no changes

      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }
  }, [editedText, isEditing]);

  const handleSave = async () => {
    if (editedText === text) return;

    try {
      const response = await fetch("/api/transcript/segment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId,
          text: editedText,
        }),
      });

      if (response.ok) {
        onTextChange?.(segmentId, editedText);
        console.log("Transcript segment saved");
      } else {
        console.error("Failed to save transcript segment");
        // Optionally revert changes
        setEditedText(text);
      }
    } catch (error) {
      console.error("Error saving transcript:", error);
      setEditedText(text);
    }
  };

  const handleWordClick = (wordIndex: number) => {
    setIsEditing(true);
    setSelectedWord(wordIndex);

    // Focus textarea after state update
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();

        // Calculate cursor position for the clicked word
        const words = editedText.split(" ");
        let position = 0;
        for (let i = 0; i < wordIndex; i++) {
          position += words[i].length + 1; // +1 for space
        }

        // Set cursor at the beginning of the clicked word
        textareaRef.current.setSelectionRange(position, position);
      }
    }, 0);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setIsEditing(false);
      handleSave();
    }
    if (e.key === "Escape") {
      setEditedText(text);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    setSelectedWord(null);
    // Save on blur if text changed
    if (editedText !== text) {
      handleSave();
    }
  };

  const words = editedText.split(" ");

  // Function to highlight search term in a word
  const highlightSearchTerm = (word: string) => {
    if (!searchTerm || searchTerm.length === 0) {
      return word;
    }

    const searchLower = searchTerm.toLowerCase();
    const wordLower = word.toLowerCase();
    const index = wordLower.indexOf(searchLower);

    if (index === -1) {
      return word;
    }

    // Split the word into parts: before match, match, after match
    const before = word.substring(0, index);
    const match = word.substring(index, index + searchTerm.length);
    const after = word.substring(index + searchTerm.length);

    return (
      <>
        {before}
        <mark className="bg-orange-200 dark:bg-orange-700 px-0.5 rounded">
          {match}
        </mark>
        {after}
      </>
    );
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [editedText, isEditing]);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={editedText}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn(
          "w-full resize-none outline-none bg-transparent border border-blue-400 px-1 py-0.5 rounded",
          "text-sm text-gray-900 dark:text-gray-100 leading-relaxed",
          className,
        )}
        spellCheck={false}
        autoFocus
      />
    );
  }

  return (
    <div className={cn("inline-block", className)}>
      {words.map((word, index) => (
        <React.Fragment key={index}>
          <span
            className="cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              handleWordClick(index);
            }}
            title="Click to edit"
          >
            {highlightSearchTerm(word)}
          </span>
          {index < words.length - 1 && " "}
        </React.Fragment>
      ))}
    </div>
  );
};

export default EditableTranscript;
