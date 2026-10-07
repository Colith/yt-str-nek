"use client"

import { useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Loader2, GripVertical, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/format"
import type { QueueItem } from "@/types"

function SortableQueueRow({
  item,
  index,
  onRemove,
}: {
  item: QueueItem
  index: number
  onRemove: (id: string) => void
}) {
  const [removing, setRemoving] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border border-border/60 bg-card/70 p-3 backdrop-blur-sm ${
        isDragging ? "z-10 opacity-80 shadow-lg" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Reordenar ${item.song.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="w-6 shrink-0 text-center text-sm font-semibold text-primary">
        {index + 1}
      </span>

      {item.song.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.song.thumbnail}
          alt=""
          className="h-11 w-20 shrink-0 rounded-md object-cover"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.song.title}>
          {item.song.title}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 truncate text-xs text-muted-foreground">
          <span className="truncate">{item.song.channel}</span>
          {item.song.durationSec !== null && <span>{formatDuration(item.song.durationSec)}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {item.requesterName && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {item.requesterName}
            </span>
          )}
          {item.addedBy && <span>añadido por {item.addedBy.username}</span>}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Eliminar"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        disabled={removing}
        onClick={async () => {
          setRemoving(true)
          await onRemove(item.id)
          setRemoving(false)
        }}
      >
        {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </Button>
    </li>
  )
}

export function QueueList({
  queue,
  onRemove,
  onReorder,
}: {
  queue: QueueItem[]
  onRemove: (id: string) => void
  onReorder: (items: QueueItem[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = queue.findIndex((i) => i.id === active.id)
    const newIndex = queue.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(queue, oldIndex, newIndex))
  }

  if (queue.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
        La cola está vacía. Busca una canción o pega un enlace para empezar.
      </p>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={queue.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {queue.map((item, index) => (
            <SortableQueueRow
              key={item.id}
              item={item}
              index={index}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}