'use client';

import { useCallback } from 'react';
import { useDaily } from '@daily-co/daily-react';

export const useCVICall = (): {
	joinCall: (props: { url: string; audioSource?: MediaStreamTrack }) => Promise<void>;
	leaveCall: () => Promise<void>;
} => {
	const daily = useDaily();

	const joinCall = useCallback(
		async ({ url, audioSource }: { url: string; audioSource?: MediaStreamTrack }) => {
			if (!daily) throw new Error('Tavus media connection is not initialized.');
			await daily.join({
				url,
				videoSource: true,
				...(audioSource ? { audioSource } : {}),
			});
		},
		[daily]
	);

	const leaveCall = useCallback(async () => {
		if (daily) await daily.leave();
	}, [daily]);

	return { joinCall, leaveCall };
};
