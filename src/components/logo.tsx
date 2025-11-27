import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function Logo({ size = 'md', showText = true, className }: LogoProps) {
  const sizes = {
    sm: { icon: 28, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 40, text: 'text-2xl' },
  };

  const { icon, text } = sizes[size];

  return (
    <Link href="/" className={cn('flex items-center gap-2 group', className)}>
      <div className="relative">
        <Image
          src="/logo.svg"
          alt="Inhibitor.lol"
          width={icon}
          height={icon}
          className="relative z-10"
        />
        <div
          className="absolute inset-0 bg-primary/50 blur-md opacity-0 group-hover:opacity-75 transition-opacity rounded-lg"
        />
      </div>
      {showText && (
        <span className={cn('font-bold tracking-tight', text)}>
          inhibitor
          <span className="text-primary">.lol</span>
        </span>
      )}
    </Link>
  );
}
