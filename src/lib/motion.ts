export const MOTION_DURATION = {
  fast: 0.16,
  ui: 0.24,
  default: 0.42,
  hero: 0.76,
} as const;

export const MOTION_EASE = {
  editorial: [0.22, 1, 0.36, 1],
  enter: [0.16, 1, 0.3, 1],
  exit: [0.7, 0, 0.84, 0],
} as const;

export const MOTION_SPRING = {
  snappy: { type: "spring", stiffness: 420, damping: 34 },
  soft: { type: "spring", stiffness: 180, damping: 26 },
  card: { type: "spring", stiffness: 150, damping: 20, mass: 0.82 },
  drag: { type: "spring", stiffness: 260, damping: 30 },
} as const;

export const revealVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.default, ease: MOTION_EASE.editorial },
  },
} as const;

export const blurRevealVariants = {
  hidden: { opacity: 0, y: 12, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: MOTION_DURATION.hero, ease: MOTION_EASE.editorial },
  },
} as const;

export const staggerChildren = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.085, delayChildren: 0.04 },
  },
} as const;

export const reducedMotionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
} as const;
