'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Sword } from 'lucide-react';
import { DragonIcon, BaronIcon, HeraldIcon } from '@/components/icons/objective-icons';

// Types
interface ChartDataPoint {
  minute: number;
  teamGoldDiff: number;
  playerGoldDiff: number;
  blueGold: number;
  redGold: number;
  timestamp: number;
}

interface ObjectiveMarker {
  minute: number;
  type: 'BARON' | 'DRAGON' | 'HERALD' | 'KILL' | 'MULTI_KILL' | 'ACE' | 'TOWER' | 'INHIBITOR' | 'GRUBS';
  isYourTeam: boolean;
  monsterType?: string;
}

interface Teamfight {
  minute: number;
  blueKills: number;
  redKills: number;
  duration?: number;
}

interface KeyMoment {
  minute: number;
  change: number;
  description: string;
  type: string;
  isPositive: boolean;
  details?: string;
}

interface GoldGraphProps {
  chartData: ChartDataPoint[];
  objectiveMarkers?: ObjectiveMarker[];
  teamfights?: Teamfight[];
  keyMoments?: KeyMoment[];
  playerTeamId: number;
}

// Event icon component
function EventIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case 'BARON':
      return <BaronIcon className={className} />;
    case 'DRAGON':
      return <DragonIcon className={className} />;
    case 'HERALD':
      return <HeraldIcon className={className} />;
    case 'TEAMFIGHT':
    case 'SOLO_KILL':
    case 'KILL':
      return <Sword className={className} />;
    default:
      return null;
  }
}

// Floating tooltip for events
function EventTooltip({
  events,
  goldDiff,
  minute,
  position,
  chartWidth,
}: {
  events: KeyMoment[];
  goldDiff: number;
  minute: number;
  position: { x: number; y: number };
  chartWidth: number;
}) {
  if (events.length === 0) return null;

  // Flip horizontally when past halfway (close to right edge)
  const showOnLeft = position.x > chartWidth / 2;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        x: position.x,
        y: position.y,
      }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: 0.15 },
        x: { type: 'spring', stiffness: 300, damping: 30 },
        y: { type: 'spring', stiffness: 300, damping: 30 }
      }}
      className="absolute z-50 pointer-events-none"
      style={{
        left: 0,
        top: 0,
      }}
    >
      {/* Inner wrapper for horizontal flip + vertical centering */}
      <motion.div
        animate={{
          x: showOnLeft ? 'calc(-100% - 12px)' : '12px',
          y: '-50%',
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative"
      >
        {/* Arrow pointing to the point */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-0 h-0',
            showOnLeft
              ? 'right-0 translate-x-full border-l-[6px] border-l-border border-y-[6px] border-y-transparent'
              : 'left-0 -translate-x-full border-r-[6px] border-r-border border-y-[6px] border-y-transparent'
          )}
        />
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-0 h-0',
            showOnLeft
              ? 'right-0 translate-x-[calc(100%-1px)] border-l-[5px] border-l-card border-y-[5px] border-y-transparent'
              : 'left-0 -translate-x-[calc(100%-1px)] border-r-[5px] border-r-card border-y-[5px] border-y-transparent'
          )}
        />
        {/* Tooltip card */}
        <div className="rounded-lg shadow-2xl p-3 whitespace-nowrap bg-card border border-border">
        {/* Header */}
        <div className="flex items-center justify-between gap-6 mb-2 pb-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground">{minute}:00</span>
          <span className={cn(
            'text-sm font-bold tabular-nums',
            goldDiff >= 0 ? 'text-primary' : 'text-destructive'
          )}>
            {goldDiff >= 0 ? '+' : ''}{(goldDiff / 1000).toFixed(1)}k
          </span>
        </div>

        {/* Events */}
        <div className="space-y-1.5">
          {events.map((event, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <EventIcon
                type={event.type}
                className={cn('h-4 w-4 shrink-0', event.isPositive ? 'text-primary' : 'text-destructive')}
              />
              <span className="text-sm text-foreground">{event.description}</span>
              <span className={cn(
                'text-xs font-semibold ml-auto shrink-0 tabular-nums',
                event.isPositive ? 'text-primary' : 'text-destructive'
              )}>
                {event.change > 0 ? '+' : ''}{(event.change / 1000).toFixed(1)}k
              </span>
            </div>
          ))}
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// SVG Gold Chart Component
function GoldChart({
  data,
  dataKey,
  title,
  color,
  height = 160,
  keyMoments,
}: {
  data: ChartDataPoint[];
  dataKey: 'teamGoldDiff' | 'playerGoldDiff';
  title: string;
  color: 'primary' | 'amber';
  height?: number;
  keyMoments?: KeyMoment[];
}) {
  const [hoverState, setHoverState] = useState<{
    x: number;
    y: number;
    value: number;
    minute: number;
    index: number;
  } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const observer = new ResizeObserver((entries) => {
        setContainerWidth(entries[0].contentRect.width);
      });
      observer.observe(node);
      setContainerWidth(node.getBoundingClientRect().width);
      return () => observer.disconnect();
    }
  }, []);

  // Calculate domain
  const values = data.map(d => d[dataKey]);
  const maxVal = Math.max(...values.map(Math.abs), 2000);
  const yDomain = Math.ceil(maxVal / 2000) * 2000;
  const minMinute = data.length > 0 ? data[0].minute : 0;
  const maxMinute = data.length > 0 ? data[data.length - 1].minute : 30;

  // Chart dimensions
  const padding = { left: 36, right: 12 };
  const chartWidth = containerWidth - padding.left - padding.right;
  const chartHeight = height;

  // Scale functions
  const xScale = useCallback((minute: number) => {
    const range = maxMinute - minMinute || 1;
    return padding.left + ((minute - minMinute) / range) * chartWidth;
  }, [maxMinute, minMinute, chartWidth, padding.left]);

  const yScale = useCallback((value: number) => {
    return chartHeight / 2 - (value / yDomain) * (chartHeight / 2);
  }, [chartHeight, yDomain]);

  // Build path with separate positive/negative areas and lines
  const buildPath = useMemo(() => {
    if (data.length < 2 || chartWidth <= 0) return {
      line: '',
      positiveArea: '',
      negativeArea: '',
      positiveLine: '',
      negativeLine: ''
    };

    const points = data.map(d => ({
      x: xScale(d.minute),
      y: yScale(d[dataKey]),
      value: d[dataKey]
    }));

    const simpleLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const zeroY = yScale(0);

    // Build separate areas and lines
    let positiveArea = '';
    let negativeArea = '';
    const positiveLineSegments: string[] = [];
    const negativeLineSegments: string[] = [];
    let currentPositiveLine = '';
    let currentNegativeLine = '';

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Both positive
      if (p1.value >= 0 && p2.value >= 0) {
        if (!positiveArea) positiveArea = `M ${p1.x} ${zeroY} L ${p1.x} ${p1.y}`;
        positiveArea += ` L ${p2.x} ${p2.y}`;

        if (!currentPositiveLine) currentPositiveLine = `M ${p1.x} ${p1.y}`;
        currentPositiveLine += ` L ${p2.x} ${p2.y}`;

        if (currentNegativeLine) {
          negativeLineSegments.push(currentNegativeLine);
          currentNegativeLine = '';
        }
      }
      // Both negative
      else if (p1.value < 0 && p2.value < 0) {
        if (!negativeArea) negativeArea = `M ${p1.x} ${zeroY} L ${p1.x} ${p1.y}`;
        negativeArea += ` L ${p2.x} ${p2.y}`;

        if (!currentNegativeLine) currentNegativeLine = `M ${p1.x} ${p1.y}`;
        currentNegativeLine += ` L ${p2.x} ${p2.y}`;

        if (currentPositiveLine) {
          positiveLineSegments.push(currentPositiveLine);
          currentPositiveLine = '';
        }
      }
      // Crossing zero
      else {
        const ratio = Math.abs(p1.value) / (Math.abs(p1.value) + Math.abs(p2.value));
        const crossX = p1.x + (p2.x - p1.x) * ratio;

        if (p1.value >= 0) {
          // Going from positive to negative
          if (!positiveArea) positiveArea = `M ${p1.x} ${zeroY} L ${p1.x} ${p1.y}`;
          positiveArea += ` L ${crossX} ${zeroY} Z`;

          if (!currentPositiveLine) currentPositiveLine = `M ${p1.x} ${p1.y}`;
          currentPositiveLine += ` L ${crossX} ${zeroY}`;
          positiveLineSegments.push(currentPositiveLine);
          currentPositiveLine = '';

          negativeArea += `M ${crossX} ${zeroY} L ${p2.x} ${p2.y}`;
          currentNegativeLine = `M ${crossX} ${zeroY} L ${p2.x} ${p2.y}`;
        } else {
          // Going from negative to positive
          if (!negativeArea) negativeArea = `M ${p1.x} ${zeroY} L ${p1.x} ${p1.y}`;
          negativeArea += ` L ${crossX} ${zeroY} Z`;

          if (!currentNegativeLine) currentNegativeLine = `M ${p1.x} ${p1.y}`;
          currentNegativeLine += ` L ${crossX} ${zeroY}`;
          negativeLineSegments.push(currentNegativeLine);
          currentNegativeLine = '';

          positiveArea += `M ${crossX} ${zeroY} L ${p2.x} ${p2.y}`;
          currentPositiveLine = `M ${crossX} ${zeroY} L ${p2.x} ${p2.y}`;
        }
      }
    }

    // Finalize remaining segments
    if (currentPositiveLine) positiveLineSegments.push(currentPositiveLine);
    if (currentNegativeLine) negativeLineSegments.push(currentNegativeLine);

    // Close the areas
    if (positiveArea && !positiveArea.endsWith('Z')) {
      const lastPoint = points[points.length - 1];
      if (lastPoint.value >= 0) positiveArea += ` L ${lastPoint.x} ${zeroY} Z`;
    }
    if (negativeArea && !negativeArea.endsWith('Z')) {
      const lastPoint = points[points.length - 1];
      if (lastPoint.value < 0) negativeArea += ` L ${lastPoint.x} ${zeroY} Z`;
    }

    return {
      line: simpleLine,
      positiveArea,
      negativeArea,
      positiveLine: positiveLineSegments.join(' '),
      negativeLine: negativeLineSegments.join(' ')
    };
  }, [data, dataKey, chartWidth, xScale, yScale]);

  // Y-axis labels
  const yLabels = [yDomain, yDomain / 2, 0, -yDomain / 2, -yDomain];

  // X-axis labels
  const xLabels = data.filter((_, i) =>
    i === 0 || i === data.length - 1 || i % Math.max(1, Math.floor(data.length / 5)) === 0
  );

  const finalValue = data.length > 0 ? data[data.length - 1][dataKey] : 0;

  // Get events near a minute
  const getEventsAtMinute = useCallback((minute: number) => {
    if (!keyMoments) return [];
    return keyMoments.filter(m => Math.abs(m.minute - minute) <= 1);
  }, [keyMoments]);

  // Handle mouse interaction with magnetic snapping to nearest point
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length === 0 || chartWidth <= 0 || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - padding.left;
    const percent = Math.max(0, Math.min(1, mouseX / chartWidth));

    // Find the nearest data point (magnetic snapping)
    const exactIndex = percent * (data.length - 1);
    const nearestIndex = Math.round(exactIndex);
    const clampedIndex = Math.max(0, Math.min(data.length - 1, nearestIndex));

    const nearestPoint = data[clampedIndex];
    const svgX = xScale(nearestPoint.minute);
    const svgY = yScale(nearestPoint[dataKey]);

    setHoverState({
      x: svgX,
      y: svgY,
      value: nearestPoint[dataKey],
      minute: nearestPoint.minute,
      index: clampedIndex
    });
  };

  const handleMouseLeave = () => {
    setHoverState(null);
  };

  const hoveredData = hoverState ? data[hoverState.index] : null;
  const hoveredEvents = hoveredData ? getEventsAtMinute(hoveredData.minute) : [];
  const displayValue = hoverState ? hoverState.value : finalValue;

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-visible">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">{title}</span>

          <div className="flex items-center gap-2">
            {hoverState && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(hoverState.minute)}m
              </span>
            )}
            <span className={cn(
              'text-sm font-bold tabular-nums',
              displayValue >= 0 ? 'text-primary' : 'text-destructive'
            )}>
              {displayValue >= 0 ? '+' : ''}{(displayValue / 1000).toFixed(1)}k
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="flex">
          {/* Y-axis labels */}
          <div
            className="flex flex-col justify-between text-[10px] text-muted-foreground tabular-nums text-right pr-2"
            style={{ height, width: padding.left - 4 }}
          >
            {yLabels.map((label) => (
              <span key={label} className="leading-none -translate-y-1">
                {label === 0 ? '0' : `${label > 0 ? '+' : ''}${label / 1000}k`}
              </span>
            ))}
          </div>

          {/* SVG Chart */}
          <div ref={containerRef} className="flex-1 relative overflow-visible">
            <svg
              ref={svgRef}
              width="100%"
              height={chartHeight}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="overflow-visible cursor-crosshair"
            >
              <defs>
                {/* Positive area gradient (above zero - primary/indigo) */}
                <linearGradient id={`positive-gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                </linearGradient>
                {/* Negative area gradient (below zero - destructive/red) */}
                <linearGradient id={`negative-gradient-${dataKey}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {yLabels.map((label) => (
                <line
                  key={label}
                  x1={0}
                  x2={chartWidth + padding.left}
                  y1={yScale(label)}
                  y2={yScale(label)}
                  stroke="currentColor"
                  strokeOpacity={label === 0 ? 0.2 : 0.06}
                  strokeDasharray={label === 0 ? '4 4' : undefined}
                  className="text-muted-foreground"
                />
              ))}

              {/* Positive area fill (above zero - green) */}
              {buildPath.positiveArea && (
                <motion.path
                  d={buildPath.positiveArea}
                  fill={`url(#positive-gradient-${dataKey})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                />
              )}

              {/* Negative area fill (below zero - red) */}
              {buildPath.negativeArea && (
                <motion.path
                  d={buildPath.negativeArea}
                  fill={`url(#negative-gradient-${dataKey})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                />
              )}

              {/* Positive line (primary/indigo) */}
              {buildPath.positiveLine && (
                <motion.path
                  d={buildPath.positiveLine}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              )}

              {/* Negative line (destructive/red) */}
              {buildPath.negativeLine && (
                <motion.path
                  d={buildPath.negativeLine}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              )}

              {/* Event markers on line (small dots) */}
              {keyMoments && chartWidth > 0 && keyMoments.map((moment, idx) => {
                const dataPoint = data.find(d => d.minute === moment.minute);
                if (!dataPoint) return null;

                const x = xScale(moment.minute);
                const y = yScale(dataPoint[dataKey]);

                return (
                  <motion.circle
                    key={`marker-${idx}`}
                    cx={x}
                    cy={y}
                    r={4}
                    fill={moment.isPositive ? '#6366f1' : '#ef4444'}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.8 + idx * 0.05 }}
                  />
                );
              })}

              {/* Hover elements with smooth transitions */}
              {hoverState && chartWidth > 0 && (
                <g>
                  {/* Vertical line */}
                  <motion.line
                    x1={hoverState.x}
                    x2={hoverState.x}
                    y1={0}
                    y2={chartHeight}
                    stroke={hoverState.value >= 0 ? '#6366f1' : '#ef4444'}
                    strokeWidth={1}
                    strokeOpacity={0.5}
                    strokeDasharray="4 4"
                    initial={false}
                    animate={{ x1: hoverState.x, x2: hoverState.x }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                  {/* Dot */}
                  <motion.circle
                    r={6}
                    fill={hoverState.value >= 0 ? '#6366f1' : '#ef4444'}
                    stroke="white"
                    strokeWidth={2}
                    initial={false}
                    animate={{ cx: hoverState.x, cy: hoverState.y }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                </g>
              )}
            </svg>

            {/* Floating tooltip for events */}
            <AnimatePresence>
              {hoverState && hoveredEvents.length > 0 && (
                <EventTooltip
                  events={hoveredEvents}
                  goldDiff={hoverState.value}
                  minute={Math.round(hoverState.minute)}
                  position={{ x: hoverState.x, y: hoverState.y }}
                  chartWidth={chartWidth + padding.left}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground" style={{ marginLeft: padding.left }}>
          {xLabels.map((d, idx) => (
            <span key={`${d.minute}-${idx}`}>{d.minute}m</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main GoldGraph Component
export function GoldGraph({
  chartData,
  objectiveMarkers,
  teamfights,
  keyMoments,
  playerTeamId,
}: GoldGraphProps) {
  const finalGoldDiff = chartData.length > 0 ? chartData[chartData.length - 1].teamGoldDiff : 0;
  const playerFinalDiff = chartData.length > 0 ? chartData[chartData.length - 1].playerGoldDiff : 0;

  // Stagger animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  const scaleVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.46, 0.45, 0.94] as const
      }
    }
  };

  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div
          variants={scaleVariants}
          className={cn(
            'relative overflow-hidden rounded-xl p-3 text-center',
            finalGoldDiff > 0 ? 'bg-primary/10 border border-primary/20' : 'bg-destructive/10 border border-destructive/20'
          )}
        >
          <motion.div
            className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"
            style={{ backgroundColor: finalGoldDiff > 0 ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--destructive) / 0.3)' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          />
          <motion.div
            className={cn('text-lg font-bold', finalGoldDiff > 0 ? 'text-primary' : 'text-destructive')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
          >
            {finalGoldDiff > 0 ? '+' : ''}{(finalGoldDiff / 1000).toFixed(1)}k
          </motion.div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Team Gold</div>
        </motion.div>

        <motion.div
          variants={scaleVariants}
          className={cn(
            'relative overflow-hidden rounded-xl p-3 text-center',
            playerFinalDiff > 0 ? 'bg-primary/5 border border-primary/20' : playerFinalDiff < 0 ? 'bg-destructive/5 border border-destructive/20' : 'bg-card/50 border border-border/50'
          )}
        >
          <motion.div
            className={cn('text-lg font-bold', playerFinalDiff > 0 ? 'text-primary' : playerFinalDiff < 0 ? 'text-destructive' : 'text-foreground')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            {playerFinalDiff > 0 ? '+' : ''}{(playerFinalDiff / 1000).toFixed(1)}k
          </motion.div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">vs Opponent</div>
        </motion.div>

        <motion.div
          variants={scaleVariants}
          className="relative overflow-hidden rounded-xl bg-card/50 border border-border/50 p-3 text-center"
        >
          <motion.div
            className="text-lg font-bold text-foreground"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            {keyMoments?.length || 0}
          </motion.div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Key Events</div>
        </motion.div>
      </div>

      {/* Main Gold Chart */}
      <motion.div variants={itemVariants}>
        <GoldChart
          data={chartData}
          dataKey="teamGoldDiff"
          title="Team Gold Advantage"
          color="primary"
          height={180}
          keyMoments={keyMoments}
        />
      </motion.div>

      {/* You vs Opponent */}
      <motion.div variants={itemVariants}>
        <GoldChart
          data={chartData}
          dataKey="playerGoldDiff"
          title="You vs Lane Opponent"
          color="amber"
          height={140}
          keyMoments={keyMoments}
        />
      </motion.div>

      {/* Game Timeline - Compact horizontal layout */}
      {keyMoments && keyMoments.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl border border-border/50 bg-card overflow-hidden"
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-foreground">Key Events</h4>
              <span className="text-xs text-muted-foreground">{keyMoments.length} events</span>
            </div>

            {/* Horizontal scrollable timeline */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {keyMoments.map((moment, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{
                    delay: 0.4 + idx * 0.04,
                    duration: 0.3,
                    ease: [0.25, 0.46, 0.45, 0.94]
                  }}
                  whileHover={{ scale: 1.02 }}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors cursor-default',
                    moment.isPositive
                      ? 'bg-primary/5 border-primary/20 hover:border-primary/40'
                      : 'bg-destructive/5 border-destructive/20 hover:border-destructive/40'
                  )}
                >
                  <span className={cn(
                    'text-[10px] font-bold tabular-nums',
                    moment.isPositive ? 'text-primary' : 'text-destructive'
                  )}>
                    {moment.minute}m
                  </span>
                  <EventIcon
                    type={moment.type}
                    className={cn('h-3.5 w-3.5', moment.isPositive ? 'text-primary' : 'text-destructive')}
                  />
                  <span className="text-foreground whitespace-nowrap">{moment.description}</span>
                  <span className={cn(
                    'text-xs font-semibold tabular-nums',
                    moment.isPositive ? 'text-primary' : 'text-destructive'
                  )}>
                    {moment.change > 0 ? '+' : ''}{(moment.change / 1000).toFixed(1)}k
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default GoldGraph;
