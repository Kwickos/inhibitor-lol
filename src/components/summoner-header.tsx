'use client';

import { motion } from 'framer-motion';
import { Star, RefreshCw, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getProfileIconUrl } from '@/lib/riot-api';
import { useFavorites } from '@/hooks/use-favorites';
import { cn } from '@/lib/utils';

interface SummonerHeaderProps {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string;
  profileIconId: number;
  summonerLevel: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function SummonerHeader({
  puuid,
  gameName,
  tagLine,
  region,
  profileIconId,
  summonerLevel,
  onRefresh,
  isRefreshing = false,
}: SummonerHeaderProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [copied, setCopied] = useState(false);
  const isFav = isFavorite(puuid);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${gameName}#${tagLine}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleFavorite = () => {
    toggleFavorite({ puuid, gameName, tagLine, region });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col sm:flex-row items-start sm:items-center gap-6"
    >
      {/* Avatar */}
      <div className="relative">
        <Avatar className="h-24 w-24 sm:h-28 sm:w-28 ring-4 ring-border/50">
          <AvatarImage
            src={getProfileIconUrl(profileIconId)}
            alt={gameName}
            className="object-cover"
          />
          <AvatarFallback className="text-3xl font-bold bg-secondary">
            {gameName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Level badge */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-card border border-border text-sm font-bold">
          {summonerLevel}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {gameName}
            <span className="text-muted-foreground font-normal">#{tagLine}</span>
          </h1>

          {/* Copy button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? 'Copied!' : 'Copy Riot ID'}
            </TooltipContent>
          </Tooltip>

          {/* Favorite button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleToggleFavorite}
              >
                <Star
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isFav ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isFav ? 'Remove from favorites' : 'Add to favorites'}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-4 mt-2 text-muted-foreground">
          <span className="uppercase text-sm font-medium tracking-wider">{region}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Refresh button */}
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Update
          </Button>
        )}
      </div>
    </motion.div>
  );
}
