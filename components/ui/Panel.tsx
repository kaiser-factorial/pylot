'use client'

// Adapted from ccru 7c38ad9104 (CyberContainer + CyberPanel + CyberPanelHeader,
// by @lumpenspace — verbatim originals in vendor/themez/ccru/). Fork-and-tokenize
// per ROADMAP Phase 1: upstream structure and collapse behavior are kept; all
// hardcoded colors/effects are re-expressed through the theme tokens in
// globals.css, so one component renders neon-on-dark under cyber and
// 3px-black-border Bauhaus under primary. Drag/fixed-position machinery from
// upstream is dropped — Pylot panes are docked.

import React, { useState } from 'react'

type PanelHeaderProps = {
  title: React.ReactNode
  leftSlot?: React.ReactNode
  rightSlot?: React.ReactNode
  className?: string
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
  ariaExpanded?: boolean
}

export function PanelHeader({
  title,
  leftSlot,
  rightSlot,
  className = '',
  onClick,
  ariaExpanded,
}: PanelHeaderProps) {
  return (
    <header
      className={`flex w-full items-center gap-2 px-3 py-2 ${className}`}
      onClick={onClick}
      aria-expanded={ariaExpanded}
      style={{
        background: 'var(--pane-header-bg)',
        borderBottom: `var(--pane-border-w) solid var(--pane-border)`,
      }}
    >
      {leftSlot}
      <span
        className="pane-title-fx text-[10px] font-bold uppercase tracking-[0.25em]"
        style={{ color: 'var(--pane-title)' }}
      >
        {title}
      </span>
      {rightSlot && (
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {rightSlot}
        </div>
      )}
    </header>
  )
}

type CollapseDirection = 'none' | 'vertical' | 'side'

export type PanelProps = {
  id: string
  title: string
  children: React.ReactNode
  collapse?: CollapseDirection
  defaultOpen?: boolean
  headerRight?: React.ReactNode
  /** flex-fill inside a column/row parent; body scrolls internally */
  fill?: boolean
  className?: string
  bodyClassName?: string
}

export function Panel({
  id,
  title,
  children,
  collapse = 'none',
  defaultOpen = true,
  headerRight,
  fill = false,
  className = '',
  bodyClassName = '',
}: PanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const isCollapsible = collapse !== 'none'
  const isOpen = isCollapsible ? open : true
  const isSideClosed = collapse === 'side' && !isOpen

  const chrome: React.CSSProperties = {
    border: 'var(--pane-border-w) solid var(--pane-border)',
    background: 'var(--pane-bg-gradient, var(--pane-bg))',
    backgroundColor: 'var(--pane-bg)',
    boxShadow: 'var(--pane-shadow)',
    clipPath: 'var(--pane-clip)',
  }

  const toggleButton = isCollapsible && collapse === 'vertical' && (
    <button
      type="button"
      data-testid={`panel-toggle-${id}`}
      aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
      onClick={() => setOpen((v) => !v)}
      className="btn-anim px-1"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        style={{
          transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: 'transform 0.2s ease',
        }}
      >
        <path
          d="M2 3.5L5 6.5L8 3.5"
          stroke="var(--pane-title)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
    </button>
  )

  if (collapse === 'side') {
    // Upstream's side-collapse: body slides away, a vertical title rail remains.
    return (
      <section
        data-testid={`panel-${id}`}
        className={`relative flex min-h-0 flex-col transition-all duration-200 ${className}`}
        style={{ ...chrome, width: isSideClosed ? 36 : undefined }}
      >
        {!isSideClosed && <PanelHeader title={title} rightSlot={headerRight} />}
        <div className="flex min-h-0 flex-1 items-stretch">
          <div
            className={`min-w-0 flex-1 overflow-auto transition-all duration-200 ${bodyClassName}`}
            style={{
              opacity: isOpen ? 1 : 0,
              maxWidth: isOpen ? undefined : 0,
              pointerEvents: isOpen ? 'auto' : 'none',
            }}
          >
            {children}
          </div>
          <button
            type="button"
            data-testid={`panel-toggle-${id}`}
            aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            onClick={() => setOpen((v) => !v)}
            className="btn-anim flex w-9 flex-shrink-0 items-center justify-center"
            style={{
              borderLeft: isOpen ? `1px solid var(--pane-border)` : 'none',
              color: 'var(--pane-title)',
            }}
          >
            <span
              className="text-[9px] font-bold uppercase tracking-[0.2em]"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              {title} {isOpen ? '◂' : '▸'}
            </span>
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      data-testid={`panel-${id}`}
      className={`relative flex min-h-0 flex-col ${className}`}
      style={chrome}
    >
      {/* upstream's corner tick accents */}
      <div
        aria-hidden
        className="absolute left-0 top-0 h-px w-3"
        style={{ background: 'var(--pane-border-strong)' }}
      />
      <div
        aria-hidden
        className="absolute left-0 top-0 h-3 w-px"
        style={{ background: 'var(--pane-border-strong)' }}
      />
      <PanelHeader
        title={title}
        ariaExpanded={isCollapsible ? isOpen : undefined}
        onClick={isCollapsible ? () => setOpen((v) => !v) : undefined}
        className={isCollapsible ? 'cursor-pointer select-none' : ''}
        rightSlot={
          <>
            {headerRight}
            {toggleButton}
          </>
        }
      />
      <div
        className={`${fill ? 'min-h-0 flex-1 overflow-auto' : 'overflow-hidden'} transition-all duration-200 ${bodyClassName}`}
        style={
          isCollapsible && !fill
            ? { maxHeight: isOpen ? 2000 : 0, opacity: isOpen ? 1 : 0 }
            : isCollapsible && fill && !isOpen
              ? { maxHeight: 0, opacity: 0, flex: '0 0 auto' }
              : undefined
        }
      >
        {children}
      </div>
    </section>
  )
}
