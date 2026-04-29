import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ProfileVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  videoSrc: string;
  ctaLabel: string;
  ctaAction: () => void;
  comingSoon?: boolean;
  videoFit?: 'cover' | 'contain';
}

export function ProfileVideoModal({
  open,
  onOpenChange,
  title,
  videoSrc,
  ctaLabel,
  ctaAction,
  comingSoon,
  videoFit = 'cover',
}: ProfileVideoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    if (!open && videoRef.current) {
      videoRef.current.pause();
      setIsMuted(true);
    }
  }, [open]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        <div className="relative w-full aspect-[4/3] bg-black">
          <video
            ref={videoRef}
            src={open ? videoSrc : undefined}
            autoPlay
            muted={isMuted}
            controls
            playsInline
            loop
            className={`w-full h-full ${videoFit === 'contain' ? 'object-contain' : 'object-cover object-[center_top]'}`}
          />
          <button
            type="button"
            onClick={toggleMute}
            className="absolute bottom-3 right-3 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
            aria-label={isMuted ? 'Ativar som' : 'Desativar som'}
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
        <div className="p-5 space-y-3 text-center">
          <DialogHeader>
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </DialogHeader>
          <Button
            size="lg"
            className="w-full text-white font-semibold"
            style={{ backgroundColor: comingSoon ? '#64748b' : '#FF7A00' }}
            onClick={ctaAction}
          >
            {ctaLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
