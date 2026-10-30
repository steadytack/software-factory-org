import { Columns3, GripVertical } from "lucide-react";
import type { Column } from "@tanstack/react-table";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Checkbox } from "../checkbox";
import { IconButton } from "../icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { WithTooltip } from "../with-tooltip";

/** One draggable row in the Manage Columns popover. */
function SortableColumnItem({
  id,
  label,
  checked,
  onToggle,
}: {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-sm transition-colors hover:bg-muted"
    >
      <WithTooltip label={`Reorder ${label}`}>
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label}`}
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </WithTooltip>
      <label className="flex flex-1 cursor-pointer items-center gap-2 py-1">
        <Checkbox checked={checked} onCheckedChange={() => onToggle()} />
        {label}
      </label>
    </div>
  );
}

/** Toolbar popover: show/hide columns and drag to reorder them. */
export function ColumnsMenu<T>({
  columns,
  onDragEnd,
  triggerClassName,
}: {
  columns: Column<T, unknown>[];
  onDragEnd: (event: DragEndEvent) => void;
  triggerClassName?: string;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton label="Columns" variant="secondary" className={triggerClassName}>
          <Columns3 />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-0 p-1">
        <p className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
          Show and reorder columns
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {columns.map((col) => (
              <SortableColumnItem
                key={col.id}
                id={col.id}
                label={String(col.columnDef.header || col.id)}
                checked={col.getIsVisible()}
                onToggle={() => col.toggleVisibility()}
              />
            ))}
          </SortableContext>
        </DndContext>
      </PopoverContent>
    </Popover>
  );
}
