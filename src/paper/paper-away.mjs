// The paper leaving for a view over the cloth (the works row, the resume) and
// coming back, either side up: it shrinks a little, blurs and fades, and the
// view follows it out a moment later; back, it grows into place as the view
// leaves. The shrink adds to the paper's pose (paper-pose.mjs), which it
// keeps; the fade is its own animation, so it does not add up. The 2 px blur
// lets the paper and the view read as one change rather than two things
// crossing (emilkowal.ski/ui/7-practical-animation-tips, no. 7).

// `duration`: ms either way; `shrink`: how small it gets; `blur`: px at its
// faintest; `follow`: the share of `duration` a view waits before arriving.
export const PAPER_AWAY = Object.freeze({ duration: 460, shrink: .88, blur: 2, follow: .35, easing: 'cubic-bezier(.33, 0, .2, 1)' });

// The ms a view waits, after the paper starts to go, before it arrives.
export const followDelay = () => PAPER_AWAY.duration * PAPER_AWAY.follow;

export class PaperAway {
  constructor(paper, motionPreference) {
    this.paper = paper;
    this.motionPreference = motionPreference;
    this.animations = null;
  }

  // Shrinks, blurs and fades the paper, which stays so until back().
  away() { return this.run(true); }

  // Grows it back into place from wherever away() left it.
  back() { return this.run(false); }

  async run(away) {
    this.animations?.forEach(animation => animation.cancel());
    this.animations = null;
    if (this.motionPreference.matches) return;
    const scale = [{ transform: 'scale(1)' }, { transform: `scale(${PAPER_AWAY.shrink})` }];
    const fade = [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: `blur(${PAPER_AWAY.blur}px)` }];
    const options = { duration: PAPER_AWAY.duration, easing: PAPER_AWAY.easing, fill: away ? 'forwards' : 'none' };
    const animations = [
      this.paper.animate(away ? scale : scale.reverse(), { ...options, composite: 'add' }),
      this.paper.animate(away ? fade : fade.reverse(), options),
    ];
    if (away) this.animations = animations;
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  }
}
