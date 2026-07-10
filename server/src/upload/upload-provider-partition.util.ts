import { REDNOTE_CHANNEL } from '../domain/users/rednote-metadata.types';

/**
 * Split publish work into Zernio batch vs RedNote browser jobs.
 * RedNote must never enter the Zernio MCP batch path.
 */
export function partitionPublishWorkByChannel<
  T extends { channel?: string } | { row: { channel: string } },
>(workList: T[]): { zernioWork: T[]; rednoteWork: T[] } {
  const channelOf = (w: T): string => {
    if ('row' in w && w.row && typeof w.row.channel === 'string') {
      return w.row.channel;
    }
    if ('channel' in w && typeof w.channel === 'string') {
      return w.channel;
    }
    return '';
  };

  const zernioWork = workList.filter(
    (w) => channelOf(w).toLowerCase() !== REDNOTE_CHANNEL,
  );
  const rednoteWork = workList.filter(
    (w) => channelOf(w).toLowerCase() === REDNOTE_CHANNEL,
  );
  return { zernioWork, rednoteWork };
}
