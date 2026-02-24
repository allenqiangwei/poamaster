'use client';

import { useState, useRef } from 'react';
import { Box, Popover, alpha, Fade } from '@mui/material';
import { TaskStatus } from '@prisma/client';
import { designTokens as dt } from '@/lib/theme';

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: string }> = {
  TODO:        { label: '待办',   color: dt.text.muted,    icon: '○' },
  IN_PROGRESS: { label: '进行中', color: dt.accent.main,   icon: '◐' },
  DONE:        { label: '已完成', color: dt.success.main,  icon: '●' },
  CANCELLED:   { label: '已取消', color: dt.danger.main,   icon: '✕' },
  POSTPONED:   { label: '已推迟', color: dt.warning.main,  icon: '◷' },
};

/** Display-only chip (no interaction) */
interface DisplayProps {
  status: TaskStatus;
  interactive?: false;
  onChange?: never;
}

/** Interactive chip with popover selector */
interface InteractiveProps {
  status: TaskStatus;
  interactive: true;
  onChange: (status: TaskStatus) => void;
}

type TaskStatusChipProps = DisplayProps | InteractiveProps;

/** Flow order for the popover — primary statuses first, then secondary */
const STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'POSTPONED', 'CANCELLED'];

export default function TaskStatusChip(props: TaskStatusChipProps) {
  const { status, interactive } = props;
  const config = STATUS_CONFIG[status];
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (interactive) setOpen(true);
  };

  const handleSelect = (newStatus: TaskStatus) => {
    if (interactive && props.onChange) {
      props.onChange(newStatus);
    }
    setOpen(false);
  };

  return (
    <>
      {/* ── The Pill ── */}
      <Box
        ref={anchorRef}
        onClick={handleClick}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } } : undefined}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          px: 1.25,
          py: 0.5,
          borderRadius: '8px',
          fontSize: '0.8rem',
          fontWeight: 650,
          letterSpacing: '0.01em',
          lineHeight: 1,
          color: config.color,
          bgcolor: alpha(config.color, 0.1),
          border: `1px solid ${alpha(config.color, 0.18)}`,
          cursor: interactive ? 'pointer' : 'default',
          userSelect: 'none',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          whiteSpace: 'nowrap',
          ...(interactive && {
            '&:hover': {
              bgcolor: alpha(config.color, 0.16),
              borderColor: alpha(config.color, 0.32),
              boxShadow: `0 0 0 3px ${alpha(config.color, 0.08)}`,
            },
            '&:active': {
              transform: 'scale(0.97)',
            },
          }),
        }}
      >
        {/* Animated dot indicator */}
        <Box
          component="span"
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: config.color,
            flexShrink: 0,
            boxShadow: `0 0 6px ${alpha(config.color, 0.5)}`,
            ...(status === 'IN_PROGRESS' && {
              animation: 'statusPulse 2s ease-in-out infinite',
              '@keyframes statusPulse': {
                '0%, 100%': { opacity: 1, boxShadow: `0 0 6px ${alpha(config.color, 0.5)}` },
                '50%': { opacity: 0.5, boxShadow: `0 0 12px ${alpha(config.color, 0.8)}` },
              },
            }),
          }}
        />
        {config.label}
        {/* Dropdown arrow for interactive */}
        {interactive && (
          <Box
            component="span"
            sx={{
              fontSize: '0.55rem',
              opacity: 0.5,
              ml: -0.25,
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            ▼
          </Box>
        )}
      </Box>

      {/* ── Popover Selector ── */}
      {interactive && (
        <Popover
          open={open}
          anchorEl={anchorRef.current}
          onClose={() => setOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          TransitionComponent={Fade}
          transitionDuration={150}
          slotProps={{
            paper: {
              sx: {
                mt: 0.75,
                borderRadius: '10px',
                minWidth: 160,
                overflow: 'hidden',
                border: `1px solid ${dt.border.default}`,
                boxShadow: `0 8px 30px ${alpha('#0f172a', 0.12)}, 0 2px 8px ${alpha('#0f172a', 0.06)}`,
                py: 0.5,
              },
            },
          }}
        >
          {STATUS_ORDER.map((s, i) => {
            const cfg = STATUS_CONFIG[s];
            const isActive = s === status;
            const isSecondary = s === 'POSTPONED' || s === 'CANCELLED';

            return (
              <Box key={s}>
                {/* Divider before secondary options */}
                {i > 0 && isSecondary && STATUS_ORDER[i - 1] !== 'POSTPONED' && STATUS_ORDER[i - 1] !== 'CANCELLED' && (
                  <Box sx={{ height: 1, bgcolor: dt.border.subtle, mx: 1.5, my: 0.5 }} />
                )}
                <Box
                  onClick={() => handleSelect(s)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    px: 1.5,
                    py: 0.875,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    bgcolor: isActive ? alpha(cfg.color, 0.08) : 'transparent',
                    '&:hover': {
                      bgcolor: isActive ? alpha(cfg.color, 0.12) : alpha(cfg.color, 0.06),
                    },
                    '&:active': {
                      bgcolor: alpha(cfg.color, 0.16),
                    },
                  }}
                >
                  {/* Color dot */}
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: cfg.color,
                      flexShrink: 0,
                      boxShadow: isActive ? `0 0 8px ${alpha(cfg.color, 0.6)}` : 'none',
                      transition: 'box-shadow 0.2s',
                    }}
                  />
                  {/* Label */}
                  <Box
                    component="span"
                    sx={{
                      fontSize: '0.82rem',
                      fontWeight: isActive ? 650 : 500,
                      color: isActive ? cfg.color : dt.text.secondary,
                      flex: 1,
                      letterSpacing: '0.01em',
                    }}
                  >
                    {cfg.label}
                  </Box>
                  {/* Check mark */}
                  {isActive && (
                    <Box
                      component="span"
                      sx={{
                        fontSize: '0.7rem',
                        color: cfg.color,
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Popover>
      )}
    </>
  );
}
