import { motion } from 'framer-motion';
import { Heart, MessageCircle, Sparkles } from 'lucide-react';
import { Eyebrow, FilmScene, Reveal, ease } from '../FilmArt';

export function Scene2() {
  return (
    <FilmScene light className="gist-scene">
      <div className="gist-wash" />
      <div className="gist-copy">
        <Eyebrow delay={.15}>01&nbsp; / &nbsp;THE CONVERSATION</Eyebrow>
        <Reveal delay={.33} className="feature-title ink">EVERY<br />STORY</Reveal>
        <Reveal delay={.92} className="feature-title pink">HAS A<br />CAMPUS.</Reveal>
        <Reveal delay={2.95} className="support-line ink">REAL CAMPUS CONVERSATIONS</Reveal>
      </div>
      <motion.div className="gist-cards" initial={{ scale: .5, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: -5, opacity: 1 }} exit={{ scale: 1.6, rotate: 5, opacity: 0 }} transition={{ duration: .85, ease }}>
        <div className="gist-ghost" />
        <div className="gist-card back"><span className="tiny-label">CAMPUS GIST</span><p>Anyone at the library today?</p><span className="tiny-reaction"><MessageCircle size={18} /> 12 replies</span></div>
        <div className="gist-card front">
          <div className="card-top"><span className="avatar-dot">X</span><div><b>Campus Gist</b><small>What’s happening on campus?</small></div><Sparkles size={25} color="#FF2E93" /></div>
          <motion.span className="category-pill" initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.45 }}>Amebo Hot</motion.span>
          <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }}>That exam timetable update…</motion.p>
          <div className="card-rule" />
          <div className="card-footer"><Heart size={20} fill="#ff2e93" color="#ff2e93" /><span>Campus conversations, all in one place.</span></div>
        </div>
      </motion.div>
      <motion.div className="gist-pulse" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1.35], opacity: [0, .8, 0] }} transition={{ delay: 3.6, duration: 1.2 }} />
      <span className="film-index dark-index">02 / 06</span>
    </FilmScene>
  );
}