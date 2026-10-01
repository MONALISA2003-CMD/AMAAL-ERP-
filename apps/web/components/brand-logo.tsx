import Image from 'next/image';

type BrandLogoProps = {
  variant?: 'full' | 'mark';
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ variant = 'full', className = '', priority = false }: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <Image
        className={`brand-logo brand-logo-mark ${className}`.trim()}
        src="/brand/amaal-icon.png"
        alt="Amaal"
        width={64}
        height={64}
        priority={priority}
      />
    );
  }

  return (
    <Image
      className={`brand-logo brand-logo-full ${className}`.trim()}
      src="/brand/amaal-logo.png"
      alt="Amaal"
      width={300}
      height={205}
      priority={priority}
    />
  );
}
