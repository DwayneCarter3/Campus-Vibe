import { motion } from 'framer-motion';
import { Eyebrow, FilmScene, Reveal, XMark, ease } from '../FilmArt';

const nodes = [
  { x: '69%', y: '16%', delay: .15 }, { x: '91%', y: '16%', delay: .58 },
  { x: '69%', y: '84%', delay: .98 }, { x: '91%', y: '84%', delay: 1.38 },
];

export function Scene1() {
  return (
    <FilmScene className="opening">
      <div className="film-grid" />
      <motion.div className="opening-mark" initial={{ scale: .2, rotate: -15, opacity: .4 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 2.8, x: '-20%', opacity: 0, filter: 'blur(12px)' }} transition={{ duration: 1.1, ease }}>
        <XMark glow />
      </motion.div>
      {nodes.map((node, i) => <motion.span key={i} className="floating-node" style={{ left: node.x, top: node.y }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: .85 }} transition={{ delay: node.delay, type: 'spring', stiffness: 400, damping: 24 }} />)}
      <div className="opening-copy">
        <Eyebrow delay={.1}>THE CAMPUSX STORY&nbsp; / &nbsp;01</Eyebrow>
        <Reveal delay={.35} className="hero-line">YOUR<br />CAMPUS.</Reveal>
        <Reveal delay={1.3} className="hero-line gradient-text">CONNECTED.</Reveal>
        <Reveal delay={2.16} className="subline">CAMPUSX <span className="hairline" /> THE STUDENT NETWORK</Reveal>
      </div>
      <motion.div className="orbit-ring" initial={{ scale: .4, opacity: 0 }} animate={{ scale: 1.1, opacity: .42 }} exit={{ scale: 4, opacity: 0 }} transition={{ duration: 2.6, ease }} />
      <span className="film-index">01 / 06</span>
    </FilmScene>
  );
}