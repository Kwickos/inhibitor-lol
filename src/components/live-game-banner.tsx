'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveGameModal } from '@/components/live-game-modal';
import { cn } from '@/lib/utils';

interface LiveGameBannerProps {
  puuid: string;
  region: string;
  inGame: boolean;
  gameData?: {
    gameId: number;
    gameMode: string;
    gameStartTime: number;
    gameLength: number;
    queueId: number;
    participants: Array<{
      championId: number;
      teamId: number;
      gameName: string;
      tagLine: string;
      puuid: string;
      rank?: {
        tier: string;
        rank: string;
        lp: number;
      } | null;
    }>;
  };
}

export function LiveGameBanner({ puuid, region, inGame, gameData }: LiveGameBannerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [gameTime, setGameTime] = useState(0);

  // Check if game has started (gameStartTime === 0 means still in champ select)
  const gameStarted = gameData?.gameStartTime && gameData.gameStartTime > 0;

  // Update game time every second
  useEffect(() => {
    if (!inGame || !gameData || !gameStarted) return;

    const startTime = gameData.gameStartTime;
    const updateTime = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setGameTime(Math.max(0, elapsed));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [inGame, gameData, gameStarted]);

  if (!inGame || !gameData) return null;

  const formattedTime = gameStarted
    ? `${Math.floor(gameTime / 60)}:${(gameTime % 60).toString().padStart(2, '0')}`
    : 'Champ Select';

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            'relative overflow-hidden rounded-xl border border-[#f59e0b]/30 bg-gradient-to-r from-[#f59e0b]/10 via-[#f59e0b]/5 to-transparent',
            'p-4 sm:p-5'
          )}
        >
          {/* Animated background pulse */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#f59e0b]/10 to-transparent animate-pulse" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Live indicator */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Radio className="h-5 w-5 text-[#f59e0b]" />
                  <span className="absolute inset-0 rounded-full bg-[#f59e0b] animate-ping opacity-30" />
                </div>
                <span className="text-[#f59e0b] font-bold uppercase tracking-wider text-sm">
                  Live
                </span>
              </div>

              {/* Game info */}
              <div>
                <div className="font-semibold">{gameData.gameMode}</div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formattedTime}</span>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="gap-1 border-[#f59e0b]/30 hover:border-[#f59e0b]/50 hover:bg-[#f59e0b]/10"
            >
              View Game
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      <LiveGameModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        gameData={gameData}
        currentPuuid={puuid}
      />
    </>
  );
}
