import { ReactNode } from 'react';
import { durationToHeight, timeToY } from '../../lib/calendar-grid';

export type CalendarSession = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  student_name: string;
  subject?: string | null;
  topic?: string | null;
  status?: string;
  paid?: boolean;
  notes_internal?: string | null;
  notes_parent_facing?: string | null;
};

type Props = {
  session: CalendarSession;
  dayStart: Date;
  laneIndex: number;
  laneCount: number;
  isDragging?: boolean;
  isResizing?: boolean;
  ghost?: boolean;
  onClick?: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  onResizeStart?: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  pipeline?: ReactNode;
};

// Single-session block for the day calendar. Forest-tinted background,
// 1px green left border, status icon row at the bottom. The block size
// scales with session duration.
export function CalendarBlock({
  session, dayStart, laneIndex, laneCount,
  isDragging, isResizing, ghost,
  onClick, onDragStart, onResizeStart, onContextMenu,
  pipeline,
}: Props) {
  const top = timeToY(new Date(session.scheduled_at), dayStart);
  const height = durationToHeight(session.duration_minutes);

  const widthPct = 100 / laneCount;
  const leftPct = laneIndex * widthPct;

  const status = session.status ?? 'scheduled';
  const tone = status === 'completed' ? 'success' : status === 'cancelled' ? 'neutral' : status === 'no_show' ? 'claret' : 'forest';

  const opacity = ghost ? 0.4 : isDragging ? 0.7 : 1;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onDragStart}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      className={[
        'absolute group rounded-md cursor-grab active:cursor-grabbing',
        'border-l-2 border-y border-r border-rule',
        'transition-shadow duration-100',
        isDragging || isResizing ? 'shadow-lift z-20' : 'hover:shadow-sm',
        tone === 'success' ? 'bg-success-soft/40 border-l-success' :
          tone === 'claret' ? 'bg-claret/8 border-l-claret' :
          tone === 'neutral' ? 'bg-ruleSoft/60 border-l-ink-soft' :
          'bg-forest-soft/45 border-l-forest',
      ].join(' ')}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        opacity,
        touchAction: 'none',
      }}
      aria-label={`${session.student_name} at ${new Date(session.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
    >
      <div className="px-2 py-1 h-full flex flex-col overflow-hidden">
        <div className="text-[12px] font-medium text-ink truncate leading-tight">
          {session.student_name}
        </div>
        {height > 32 && (
          <div className="text-2xs text-ink-muted truncate">
            {[session.subject, session.topic, `${session.duration_minutes}m`].filter(Boolean).join(' · ')}
          </div>
        )}
        {height > 56 && pipeline && (
          <div className="mt-auto pb-0.5">{pipeline}</div>
        )}
      </div>
      {/* Resize handle — bottom edge */}
      <div
        onPointerDown={(e) => { e.stopPropagation(); onResizeStart?.(e); }}
        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize group-hover:bg-forest/15"
        aria-label="Resize"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}

export default CalendarBlock;
