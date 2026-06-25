import logoImage from '@/assets/logo.png';

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  rounded?: boolean;
}

const sizeMap = {
  xs: 'h-4',
  sm: 'h-10',
  md: 'h-16',
  lg: 'h-20',
  xl: 'h-32',
  '2xl': 'h-40'
};

export function Logo({ size = 'md', showText = false, rounded = false }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={logoImage}
        alt="Viagg-TX8 Logo"
        className={`${sizeMap[size]} w-auto object-contain ${rounded ? 'rounded-2xl' : 'rounded-md'}`}
      />
      {showText && (
        <span className="text-2xl font-bold tracking-tight text-[#C9A443]">
          Viagg-TX8™
        </span>
      )}
    </div>
  );
}
