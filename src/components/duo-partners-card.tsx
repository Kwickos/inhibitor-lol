'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getProfileIconUrl } from '@/lib/riot-api';
import { cn } from '@/lib/utils';
import type { RegionKey } from '@/lib/constants/regions';

interface DuoPartner {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface DuoPartnersCardProps {
  puuid: string;
  region: RegionKey;
}

export function DuoPartnersCard({ puuid, region }: DuoPartnersCardProps) {
  const [partners, setPartners] = useState<DuoPartner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDuoPartners() {
      try {
        const res = await fetch(`/api/duo-partners/${puuid}?region=${region}&minGames=2`);
        if (!res.ok) throw new Error('Failed to fetch duo partners');
        const data = await res.json();
        setPartners(data.partners);
      } catch (error) {
        console.error('Failed to fetch duo partners:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDuoPartners();
  }, [puuid, region]);

  if (isLoading) {
    return <DuoPartnersSkeleton />;
  }

  if (partners.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-card/80">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />

        <div className="relative p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Duo Partners
            </h3>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
              <Users className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-medium text-blue-400">{partners.length}</span>
            </div>
          </div>

          {/* Partner List */}
          <div className="space-y-2">
            {partners.map((partner, index) => (
              <DuoPartnerRow key={partner.puuid} partner={partner} index={index} isFirst={index === 0} />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DuoPartnerRow({ partner, index, isFirst }: { partner: DuoPartner; index: number; isFirst: boolean }) {
  const winRateColor = partner.winRate >= 60 ? 'text-primary' : partner.winRate >= 50 ? 'text-foreground' : 'text-destructive';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className={cn(
        'relative flex items-center gap-3 p-3 rounded-xl transition-colors',
        isFirst
          ? 'bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20'
          : 'hover:bg-muted/30'
      )}
    >
      {/* Profile icon */}
      <div className="relative">
        <Image
          src={getProfileIconUrl(partner.profileIconId)}
          alt={partner.gameName}
          width={40}
          height={40}
          className="rounded-xl ring-2 ring-border/50"
          unoptimized
        />
        {/* Games badge */}
        <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md bg-card border border-border text-[10px] font-bold">
          {partner.gamesPlayed}
        </div>
      </div>

      {/* Partner info */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate text-sm">
          {partner.gameName}
          <span className="text-muted-foreground font-normal">#{partner.tagLine}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {partner.gamesPlayed} ranked games together
        </div>
      </div>

      {/* Win rate with visual bar */}
      <div className="flex flex-col items-end gap-1">
        <div className={cn('text-sm font-bold', winRateColor)}>
          {partner.winRate.toFixed(0)}%
        </div>
        <div className="w-12 h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${partner.winRate}%` }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={cn(
              'h-full rounded-full',
              partner.winRate >= 60 ? 'bg-primary' : partner.winRate >= 50 ? 'bg-foreground/50' : 'bg-destructive'
            )}
          />
        </div>
        <div className="text-[10px] text-muted-foreground">
          {partner.wins}W {partner.losses}L
        </div>
      </div>
    </motion.div>
  );
}

function DuoPartnersSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-card via-card to-card/80">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
              <div className="flex flex-col items-end gap-1">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-1.5 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
