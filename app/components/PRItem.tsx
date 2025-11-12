"use client";

import { useState, useRef, useEffect } from "react";
import type { PR } from "@/app/gh-sync";

export function PRItem({
  pr,
  onUpdateTitle,
}: {
  pr: PR;
  owner: string;
  name: string;
  onUpdateTitle: (prId: string, title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async (value: string) => {
    if (value && value !== pr.title) {
      await onUpdateTitle(pr.id, value);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave(e.currentTarget.value.trim());
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 dark:text-zinc-400 shrink-0">
          #{pr.number}
        </span>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            defaultValue={pr.title}
            onKeyDown={handleKeyDown}
            onBlur={(e) => handleSave(e.currentTarget.value.trim())}
            className="font-semibold flex-1 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
        ) : (
          <h3
            onClick={() => setIsEditing(true)}
            className="font-semibold flex-1 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-400"
          >
            {pr.title}
          </h3>
        )}
      </div>
    </div>
  );
}
