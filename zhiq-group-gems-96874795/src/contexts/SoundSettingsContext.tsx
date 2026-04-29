import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

const SOUND_PREF_KEY = 'viagg_soundtrack_enabled';

interface SoundSettingsContextType {
  /** Trilha sonora ativada pelo usuário */
  soundtrackEnabled: boolean;
  /** Toggle para ativar/desativar trilha sonora */
  toggleSoundtrack: () => void;
  /** Ativar trilha sonora */
  enableSoundtrack: () => void;
  /** Desativar trilha sonora */
  disableSoundtrack: () => void;
}

const SoundSettingsContext = createContext<SoundSettingsContextType | undefined>(undefined);

interface SoundSettingsProviderProps {
  children: ReactNode;
}

export function SoundSettingsProvider({ children }: SoundSettingsProviderProps) {
  const [soundtrackEnabled, setSoundtrackEnabled] = useState(() => {
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    return saved === 'true'; // Default: desativado
  });

  // Persistir preferência no localStorage
  useEffect(() => {
    localStorage.setItem(SOUND_PREF_KEY, String(soundtrackEnabled));
  }, [soundtrackEnabled]);

  const toggleSoundtrack = useCallback(() => {
    setSoundtrackEnabled(prev => !prev);
  }, []);

  const enableSoundtrack = useCallback(() => {
    setSoundtrackEnabled(true);
  }, []);

  const disableSoundtrack = useCallback(() => {
    setSoundtrackEnabled(false);
  }, []);

  return (
    <SoundSettingsContext.Provider value={{
      soundtrackEnabled,
      toggleSoundtrack,
      enableSoundtrack,
      disableSoundtrack,
    }}>
      {children}
    </SoundSettingsContext.Provider>
  );
}

export function useSoundSettings() {
  const context = useContext(SoundSettingsContext);
  if (!context) {
    throw new Error('useSoundSettings must be used within SoundSettingsProvider');
  }
  return context;
}

export default SoundSettingsContext;
