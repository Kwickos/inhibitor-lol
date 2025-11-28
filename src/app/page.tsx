'use client';

import { motion } from 'framer-motion';
import { SearchBar } from '@/components/search-bar';
import { Logo } from '@/components/logo';
import { Zap, TrendingUp, Eye } from 'lucide-react';
import { SiDiscord } from '@icons-pack/react-simple-icons';

export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-border/30">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-4">
            <a
              href="https://discord.gg/6cyze7Dgu8"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-muted-foreground hover:text-[#5865F2] transition-colors"
            >
              <SiDiscord className="h-5 w-5" />
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-12"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8"
          >
            <Zap className="h-4 w-4" />
            Fast & Free League Stats
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
          >
            Track your{' '}
            <span className="relative">
              <span className="relative z-10 bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent">
                League
              </span>
              <span className="absolute -inset-1 bg-primary/20 blur-xl rounded-lg" />
            </span>{' '}
            stats
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto"
          >
            Match history, live games, champion stats, and more.
            <br />
            <span className="text-foreground/80">All in one beautiful place.</span>
          </motion.p>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="w-full max-w-2xl mx-auto"
        >
          <SearchBar size="large" autoFocus />
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto w-full"
        >
          <FeatureCard
            icon={TrendingUp}
            title="Match History"
            description="Detailed stats for every game you play"
            delay={0}
          />
          <FeatureCard
            icon={Eye}
            title="Live Game"
            description="See who you're playing against"
            delay={0.1}
          />
          <FeatureCard
            icon={Zap}
            title="Champion Stats"
            description="Your performance on every champion"
            delay={0.2}
          />
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            inhibitor.lol is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties.
          </p>
        </div>
      </footer>
    </main>
  );
}


interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  delay?: number;
}

function FeatureCard({ icon: Icon, title, description, delay = 0 }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.7 + delay }}
      className="group relative p-6 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm hover:bg-card/50 hover:border-border transition-all duration-300"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </motion.div>
  );
}
