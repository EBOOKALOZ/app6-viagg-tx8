export const playNotificationSound = () => {
  try {
    const BIP_URL = '/notification-beep.mp3';
    const audio = new Audio(BIP_URL);
    audio.volume = 1.0;
    audio.play().catch(e => console.warn('Audio playback blocked by browser:', e));
  } catch (e) {
    console.error('Audio playback failed', e);
  }
};

let leadSoundInterval: NodeJS.Timeout | null = null;
let leadSoundEnabled = true;

export const isLeadSoundEnabled = () => leadSoundEnabled;
export const setLeadSoundEnabled = (enabled: boolean) => {
  leadSoundEnabled = enabled;
  if (!enabled) stopLeadNotificationSound();
};

export const playLeadNotificationSound = () => {
  if (!leadSoundEnabled) return;
  if (leadSoundInterval) return; // Already playing

  playNotificationSound();
  leadSoundInterval = setInterval(() => {
    playNotificationSound();
  }, 3000); // Toca a cada 3 segundos
};

export const stopLeadNotificationSound = () => {
  if (leadSoundInterval) {
    clearInterval(leadSoundInterval);
    leadSoundInterval = null;
  }
};
