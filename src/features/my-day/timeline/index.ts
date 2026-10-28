/*
 * Public API of the My Day timeline. The screen assembler mounts
 * <MyDayDndProvider> around the timeline and the right rail, then drops in
 * <TimelineCard>. The rail's rows are draggable as `task:<id>` (see ../drag)
 * and its Unscheduled card is `useDroppable({ id: UNSCHEDULED_DROP_ID })`;
 * useMyDayDragState() tells it when to highlight.
 */
export { TimelineCard, type TimelineCardProps } from "./timeline-card";
export { MyDayDndProvider } from "./my-day-dnd";
export { useMyDayDragState, type MyDayDragState } from "./drag-state";
