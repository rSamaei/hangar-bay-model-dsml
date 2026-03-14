import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { BAY_H } from './utils/timelineConstants';

export function DroppableSlot({ id, left, slotW }: { id: string; left: number; slotW: number }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ position: 'absolute', top: 0, left, width: slotW, height: BAY_H }}
      className={isOver ? 'bg-cyan-500/15 ring-1 ring-inset ring-cyan-500/30 rounded' : ''}
    />
  );
}
