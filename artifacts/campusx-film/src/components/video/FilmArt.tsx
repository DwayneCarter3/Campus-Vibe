import { useId, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export const ease = [0.22, 1, 0.36, 1] as const;

export function XMark({ size = '100%', glow = false }: { size?: string | number; glow?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`x-${id}`} x1="8" y1="4" x2="57" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF2E93" /><stop offset="1" stopColor="#FF6B00" />
        </linearGradient>
        <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {glow && <path d="M13 10 51 54M51 10 13 54" stroke={`url(#x-${id})`} strokeWidth="17" strokeLinecap="round" opacity=".5" filter={`url(#glow-${id})`} />}
      <path d="M13 10 51 54M51 10 13 54" stroke={`url(#x-${id})`} strokeWidth="10" strokeLinecap="round" />
      <path d="M18 16 32 32 46 16M32 32 46 48" stroke="white" strokeOpacity=".42" strokeWidth="1.2" strokeLinecap="round" />
      {[ [13, 10], [51, 10], [13, 54], [51, 54], [32, 32] ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 4 ? 2.5 : 2.1} fill="white" />)}
    </svg>
  );
}

export function BrandLogo({ width = '42vmin', color = '#fff' }: { width?: string; color?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg role="img" aria-label="CampusX" width={width} viewBox="0 0 245 64" fill="none" style={{ overflow: 'visible', color }}>
      <defs><linearGradient id={`brand-${id}`} x1="8" y1="4" x2="57" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#FF2E93" /><stop offset="1" stopColor="#FF6B00" /></linearGradient></defs>
      <path d="M13 10 51 54M51 10 13 54" stroke={`url(#brand-${id})`} strokeWidth="10" strokeLinecap="round" />
      <path d="M18 16 32 32 46 16M32 32 46 48" stroke="#fff" strokeOpacity=".42" strokeWidth="1.2" strokeLinecap="round" />
      {[ [13, 10], [51, 10], [13, 54], [51, 54], [32, 32] ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 4 ? 2.5 : 2.1} fill="white" />)}
      <text x="70" y="44" fill="currentColor" fontFamily="'Space Grotesk', Inter, system-ui, sans-serif" fontSize="37" fontWeight="700" letterSpacing="-1.8">Campus<tspan fill={`url(#brand-${id})`}>X</tspan></text>
    </svg>
  );
}

export function FilmScene({ children, light = false, className = '' }: { children: ReactNode; light?: boolean; className?: string }) {
  return (
    <motion.section className={`film-scene ${light ? 'film-light' : 'film-dark'} ${className}`} initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.12, filter: 'blur(8px)' }} transition={{ duration: .42, ease }}>
      {children}
    </motion.section>
  );
}

export function Eyebrow({ children, delay = .1, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  return <motion.div className="film-eyebrow" style={style} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay, ease }}>{children}</motion.div>;
}

export function Reveal({ children, delay = 0, className = '', style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  return <motion.div className={className} style={style} initial={{ opacity: 0, y: '24%', filter: 'blur(7px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: .63, delay, ease }}>{children}</motion.div>;
}