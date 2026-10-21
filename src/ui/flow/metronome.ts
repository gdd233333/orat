import { dueClicks } from "../rhythm.ts";

export interface Metronome {
  /** 用户手势里调用。浏览器拒绝音频时静默，画面照常走。 */
  resume(): Promise<void>;
  /** 校准时钟的零点。之后每拍一个 click，每 4 拍重音。 */
  start(bpm: number, startMs: number): void;
  /** 用校准时钟的当前毫秒驱动，不自己用 setInterval。 */
  tick(nowMs: number): void;
  stop(): void;
}

export function createMetronome(): Metronome {
  const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
  let context: AudioContext | null = null;
  let bpm = 120;
  let startMs = 0;
  let nextBeat = 0;
  let running = false;

  const ensure = (): AudioContext | null => {
    if (!AudioCtor) return null;
    context ??= new AudioCtor();
    return context;
  };

  return {
    async resume() {
      const audio = ensure();
      if (audio && audio.state === "suspended")
        await audio.resume().catch(() => undefined);
    },
    start(nextBpm, nextStart) {
      bpm = nextBpm;
      startMs = nextStart;
      nextBeat = 0;
      running = true;
    },
    tick(nowMs) {
      if (!running || !context) return;
      const clicks = dueClicks(nowMs, startMs, bpm, nextBeat);
      for (const click of clicks) {
        playClick(context, click.accent);
        nextBeat = click.beat + 1;
      }
    },
    stop() {
      running = false;
    },
  };
}

function playClick(context: AudioContext, accent: boolean): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = accent ? 1760 : 988;
  const now = context.currentTime;
  gain.gain.setValueAtTime(accent ? 0.18 : 0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.05);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
