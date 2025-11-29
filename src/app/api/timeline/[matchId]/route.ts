import { NextRequest, NextResponse } from 'next/server';
import { getMatchTimeline } from '@/lib/riot-api';
import { REGIONS, type RegionKey } from '@/lib/constants/regions';
import { RiotApiError } from '@/lib/riot-api';
import type { TimelineFrame, TimelineEvent } from '@/types/riot';

// Processed event for frontend
export interface ProcessedEvent {
  timestamp: number;
  minute: number;
  type: 'KILL' | 'MULTI_KILL' | 'ACE' | 'DRAGON' | 'BARON' | 'HERALD' | 'TOWER' | 'INHIBITOR' | 'GRUBS';
  teamId: number; // Team that got the advantage
  participantId?: number;
  victimId?: number;
  assistIds?: number[];
  killCount?: number; // For multi-kills
  monsterType?: string;
  towerType?: string;
  goldSwing?: number;
}

interface Params {
  params: Promise<{
    matchId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { matchId } = await params;
    const { searchParams } = new URL(request.url);

    const region = searchParams.get('region') as RegionKey;

    // Validate region
    if (!region || !REGIONS[region]) {
      return NextResponse.json(
        { error: 'Invalid or missing region parameter' },
        { status: 400 }
      );
    }

    // Fetch timeline from Riot API
    const timeline = await getMatchTimeline(matchId, region);

    // Extract relevant frames data (we mainly need gold/xp per participant per minute)
    const frames: TimelineFrame[] = timeline.info.frames;

    // Get participant mapping (participantId -> puuid)
    const participantMap = timeline.info.participants.reduce((acc, p) => {
      acc[p.participantId] = p.puuid;
      return acc;
    }, {} as Record<number, string>);

    // Process events from all frames
    const processedEvents: ProcessedEvent[] = [];
    const killWindow: TimelineEvent[] = []; // Track kills within 10s window for multi-kills/aces
    const seenEventKeys = new Set<string>(); // Deduplicate events by unique key

    for (const frame of frames) {
      for (const event of frame.events) {
        const minute = Math.round(event.timestamp / 60000);

        // Champion kills
        if (event.type === 'CHAMPION_KILL' && event.killerId && event.victimId) {
          // Determine which team got the kill
          const killerTeam = event.killerId <= 5 ? 100 : 200;

          // Check for multi-kills (kills within 10 seconds)
          const recentKills = killWindow.filter(
            k => k.killerId === event.killerId &&
                 event.timestamp - k.timestamp < 10000
          );

          if (recentKills.length >= 2) {
            // This is part of a multi-kill, update the existing event
            const existingMultiKill = processedEvents.find(
              e => e.type === 'MULTI_KILL' &&
                   e.participantId === event.killerId &&
                   event.timestamp - (e.timestamp) < 15000
            );
            if (existingMultiKill) {
              existingMultiKill.killCount = (existingMultiKill.killCount || 2) + 1;
            } else {
              processedEvents.push({
                timestamp: event.timestamp,
                minute,
                type: 'MULTI_KILL',
                teamId: killerTeam,
                participantId: event.killerId,
                killCount: recentKills.length + 1,
                goldSwing: event.bounty || 300
              });
            }
          } else {
            processedEvents.push({
              timestamp: event.timestamp,
              minute,
              type: 'KILL',
              teamId: killerTeam,
              participantId: event.killerId,
              victimId: event.victimId,
              assistIds: event.assistingParticipantIds,
              goldSwing: (event.bounty || 300) + (event.shutdownBounty || 0)
            });
          }

          killWindow.push(event);
          // Clean old kills from window
          while (killWindow.length > 0 && event.timestamp - killWindow[0].timestamp > 15000) {
            killWindow.shift();
          }
        }

        // Elite monster kills (deduplicated by timestamp + monster type)
        if (event.type === 'ELITE_MONSTER_KILL' && event.killerTeamId) {
          const monsterKey = `monster-${event.timestamp}-${event.monsterType}`;
          if (seenEventKeys.has(monsterKey)) continue;
          seenEventKeys.add(monsterKey);

          const monsterType = event.monsterType;
          let eventType: ProcessedEvent['type'] = 'DRAGON';
          let goldSwing = 0;

          if (monsterType === 'BARON_NASHOR') {
            eventType = 'BARON';
            goldSwing = 1500; // Baron buff value estimate
          } else if (monsterType === 'DRAGON') {
            eventType = 'DRAGON';
            goldSwing = 200 + (event.monsterSubType === 'ELDER_DRAGON' ? 800 : 0);
          } else if (monsterType === 'RIFTHERALD') {
            eventType = 'HERALD';
            goldSwing = 400;
          } else if (monsterType === 'HORDE') {
            eventType = 'GRUBS';
            goldSwing = 150;
          }

          processedEvents.push({
            timestamp: event.timestamp,
            minute,
            type: eventType,
            teamId: event.killerTeamId,
            monsterType: event.monsterSubType || monsterType,
            goldSwing
          });
        }

        // Building kills (towers, inhibitors)
        if (event.type === 'BUILDING_KILL' && event.teamId) {
          const buildingType = event.buildingType;
          const isInhibitor = buildingType === 'INHIBITOR_BUILDING';
          const teamThatDestroyed = event.teamId === 100 ? 200 : 100; // teamId is the team that lost the building

          processedEvents.push({
            timestamp: event.timestamp,
            minute,
            type: isInhibitor ? 'INHIBITOR' : 'TOWER',
            teamId: teamThatDestroyed,
            towerType: event.towerType || buildingType,
            goldSwing: isInhibitor ? 50 : (event.towerType === 'OUTER_TURRET' ? 250 : event.towerType === 'INNER_TURRET' ? 300 : 350)
          });
        }
      }
    }

    // Detect teamfight clusters (3+ kills within 30 seconds)
    const teamfights: { timestamp: number; minute: number; blueKills: number; redKills: number; events: ProcessedEvent[] }[] = [];
    let currentTeamfight: typeof teamfights[0] | null = null;

    const killEvents = processedEvents.filter(e => e.type === 'KILL' || e.type === 'MULTI_KILL');

    for (const kill of killEvents) {
      if (!currentTeamfight || kill.timestamp - currentTeamfight.timestamp > 30000) {
        // Start new teamfight
        if (currentTeamfight && (currentTeamfight.blueKills + currentTeamfight.redKills) >= 3) {
          teamfights.push(currentTeamfight);
        }
        currentTeamfight = {
          timestamp: kill.timestamp,
          minute: kill.minute,
          blueKills: kill.teamId === 100 ? 1 : 0,
          redKills: kill.teamId === 200 ? 1 : 0,
          events: [kill]
        };
      } else {
        // Add to current teamfight
        if (kill.teamId === 100) currentTeamfight.blueKills++;
        else currentTeamfight.redKills++;
        currentTeamfight.events.push(kill);
      }
    }
    // Don't forget the last teamfight
    if (currentTeamfight && (currentTeamfight.blueKills + currentTeamfight.redKills) >= 3) {
      teamfights.push(currentTeamfight);
    }

    return NextResponse.json({
      frames,
      participantMap,
      frameInterval: timeline.info.frameInterval,
      events: processedEvents,
      teamfights
    });
  } catch (error) {
    console.error('Timeline API error:', error);

    if (error instanceof RiotApiError) {
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again later.' },
          { status: 429 }
        );
      }
      if (error.status === 404) {
        return NextResponse.json(
          { error: 'Timeline not found for this match' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch match timeline' },
      { status: 500 }
    );
  }
}
