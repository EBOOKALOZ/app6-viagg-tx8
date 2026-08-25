/**
 * Sistema de desbloqueio global de áudio para browsers
 * 
 * Browsers bloqueiam autoplay de áudio até que haja interação do usuário.
 * Este módulo centraliza o desbloqueio para garantir que notificações sonoras funcionem.
 */

// Flag global para rastrear estado
let isAudioUnlocked = false;
let unlockAttempts = 0;
const MAX_ATTEMPTS = 10;

/**
 * Verifica se o áudio já foi desbloqueado
 */
export function isAudioEnabled(): boolean {
  return isAudioUnlocked;
}

/**
 * Desbloqueia o AudioContext e marca como habilitado
 * Deve ser chamado em resposta a interação do usuário (click, touch, etc.)
 */
export async function unlockGlobalAudio(): Promise<boolean> {
  if (isAudioUnlocked) {
    console.log('[AudioUnlock] Já desbloqueado');
    return true;
  }

  if (unlockAttempts >= MAX_ATTEMPTS) {
    console.warn('[AudioUnlock] Máximo de tentativas atingido');
    return false;
  }

  unlockAttempts++;
  console.log('[AudioUnlock] Tentativa', unlockAttempts);

  try {
    // @ts-expect-error - vendor prefix
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const audioContext = new AudioContextClass();
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        console.log('[AudioUnlock] AudioContext resumido');
      }

      // Som silencioso para garantir desbloqueio do sistema de áudio
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0.001; // Praticamente mudo
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);

      // Aguardar o oscilador terminar
      await new Promise(resolve => setTimeout(resolve, 150));

      // Fechar contexto após uso (economiza recursos)
      setTimeout(() => {
        audioContext.close().catch(() => {});
      }, 200);
    }

    // ESTRATÉGIA 2: Tocar áudio HTML5 real (silencioso) para desbloquear elementos <audio>
    const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silentAudio.volume = 0.01;
    
    await silentAudio.play();
    await new Promise(resolve => setTimeout(resolve, 50));
    silentAudio.pause();
    silentAudio.currentTime = 0;

    // ESTRATÉGIA 3: Pré-carregar o arquivo de notificação real
    try {
      const realBeep = new Audio('/notification-beep.mp3');
      realBeep.volume = 0;
      realBeep.preload = 'auto';
      await realBeep.play().catch(() => {}); // Ignorar erro se falhar
      realBeep.pause();
      realBeep.currentTime = 0;
    } catch (e) {
      // Ignorar - é apenas um bônus
    }

    // Marcar como desbloqueado
    isAudioUnlocked = true;
    
    // Emitir evento global para outros componentes (GlobalCallContext escuta isso)
    window.dispatchEvent(new CustomEvent('motoboy-audio-unlock'));
    
    // Salvar no localStorage para persistência entre sessões
    try {
      localStorage.setItem('viagg_audio_unlocked', 'true');
    } catch (e) {
      // Ignorar erro de localStorage
    }

    console.log('[AudioUnlock] ✅ Áudio desbloqueado com sucesso!');
    return true;

  } catch (error) {
    // NotAllowedError / AbortError = autoplay bloqueado pelo navegador.
    // É comportamento normal em produção (HTTPS) — não consumir tentativa.
    const isAutoplayBlock = error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'AbortError' || error.name === 'NotSupportedError');
    if (isAutoplayBlock) {
      unlockAttempts--; // Devolver tentativa — bloqueio de autoplay não é falha real
      console.info('[AudioUnlock] Autoplay bloqueado — aguardando interação real do usuário');
    } else {
      console.warn('[AudioUnlock] Falha:', error);
    }
    return false;
  }
}

/**
 * Tenta desbloquear áudio de forma agressiva
 * Adiciona listeners em múltiplos eventos de interação
 */
export function setupAggressiveAudioUnlock(): void {
  // Verificar se já estava desbloqueado (sessão anterior)
  try {
    if (localStorage.getItem('viagg_audio_unlocked') === 'true') {
      // Ainda precisa de interação, mas sabemos que usuário já permitiu
      console.log('[AudioUnlock] Usuário já permitiu áudio anteriormente');
    }
  } catch (e) {
    // Ignorar
  }

  const events = ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown', 'mousedown'];
  
  const handleFirstInteraction = () => {
    unlockGlobalAudio().then(success => {
      if (success) {
        // Remover listeners após sucesso
        events.forEach(event => {
          document.removeEventListener(event, handleFirstInteraction, true);
        });
      }
    });
  };

  // Adicionar listeners com capture para pegar eventos antes de outros handlers
  events.forEach(event => {
    document.addEventListener(event, handleFirstInteraction, { 
      capture: true, 
      once: false, // Manter até sucesso
      passive: true 
    });
  });

  console.log('[AudioUnlock] Listeners de desbloqueio agressivo configurados');
}

/**
 * Solicita permissão de notificação e desbloqueia áudio
 * Ideal para chamar após login/seleção de perfil
 */
export async function requestAudioAndNotificationPermissions(): Promise<{
  audioUnlocked: boolean;
  notificationGranted: boolean;
}> {
  const audioUnlocked = await unlockGlobalAudio();
  
  // Notificações desabilitadas — não solicitar permissão automaticamente
  return { audioUnlocked, notificationGranted: false };
}
