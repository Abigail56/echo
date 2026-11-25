'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	DailyAudioTrack,
	DailyVideo,
	useDevices,
	useLocalSessionId,
	useMeetingState,
	useScreenVideoTrack,
	useVideoTrack,
} from '@daily-co/daily-react';
import { MicSelectBtn, CameraSelectBtn, ScreenShareButton } from '../device-select';
import { ConnectingState, LeavingState } from '../conversation-status';
import { useLocalScreenshare } from '../../hooks/use-local-screenshare';
import { useReplicaIDs } from '../../hooks/use-replica-ids';
import { useCVICall } from '../../hooks/use-cvi-call';
import { AudioWave } from '../audio-wave';

import styles from './conversation.module.css';

interface ConversationProps {
	onLeave: () => void;
	conversationUrl: string;
	audioSource: MediaStreamTrack;
	onConnected: () => void;
	onError: (error: unknown) => void;
	onVideoReady: () => void;
}

const VideoPreview = React.memo(({ id }: { id: string }) => {
	const videoState = useVideoTrack(id);
	const widthVideo = videoState.track?.getSettings()?.width;
	const heightVideo = videoState.track?.getSettings()?.height;
	const isVertical = widthVideo && heightVideo ? widthVideo < heightVideo : false;

	return (
		<div
			className={`${styles.previewVideoContainer} ${isVertical ? styles.previewVideoContainerVertical : ''} ${videoState.isOff ? styles.previewVideoContainerHidden : ''}`}
		>
			<DailyVideo
				automirror
				sessionId={id}
				type="video"
				className={`${styles.previewVideo} ${isVertical ? styles.previewVideoVertical : ''} ${videoState.isOff ? styles.previewVideoHidden : ''}`}
			/>
			<div className={styles.audioWaveContainer}>
				<AudioWave id={id} />
			</div>
		</div>
	);
});

const PreviewVideos = React.memo(() => {
	const localId = useLocalSessionId();
	const { isScreenSharing } = useLocalScreenshare();
	const replicaIds = useReplicaIDs();
	const replicaId = replicaIds[0];

	return (
		<>
			{isScreenSharing && <VideoPreview id={replicaId} />}
			<VideoPreview id={localId} />
		</>
	);
});

const MainVideo = React.memo(({ onVideoReady }: { onVideoReady: () => void }) => {
	const replicaIds = useReplicaIDs();
	const localId = useLocalSessionId();
	const videoState = useVideoTrack(replicaIds[0]);
	const screenVideoState = useScreenVideoTrack(localId);
	const meetingState = useMeetingState();
	const isScreenSharing = !screenVideoState.isOff;
	// This is one-to-one call, so we can use the first replica id
	const replicaId = replicaIds[0];
	const [hasReplicaConnected, setHasReplicaConnected] = useState(false);

	useEffect(() => {
		if (replicaId && videoState.state === 'playable') {
			setHasReplicaConnected(true);
			onVideoReady();
		}
	}, [onVideoReady, replicaId, videoState.state]);

	if (meetingState === 'left-meeting' || meetingState === 'error') {
		return <LeavingState />;
	}

	if (!hasReplicaConnected) {
		return <ConnectingState />;
	}

	if (!replicaId) {
		return <ConnectingState />;
	}

	// Switching between replica video and screen sharing video
	return (
		<div
			className={`${styles.mainVideoContainer} ${isScreenSharing ? styles.mainVideoContainerScreenSharing : ''}`}
		>
			<DailyVideo
				automirror
				sessionId={isScreenSharing ? localId : replicaId}
				type={isScreenSharing ? 'screenVideo' : 'video'}
				className={`${styles.mainVideo}
				${isScreenSharing ? styles.mainVideoScreenSharing : ''}
				${videoState.isOff ? styles.mainVideoHidden : ''}`}
			/>
			<DailyAudioTrack sessionId={replicaId} />
		</div>
	);
});

export const Conversation = React.memo(({
	onLeave,
	conversationUrl,
	audioSource,
	onConnected,
	onError,
	onVideoReady,
}: ConversationProps) => {
	const { joinCall, leaveCall } = useCVICall();
	const meetingState = useMeetingState();
	const { hasMicError } = useDevices();
	const errorReportedRef = useRef(false);
	const reportError = useCallback((cause: unknown) => {
		if (errorReportedRef.current) return;
		errorReportedRef.current = true;
		onError(cause);
	}, [onError]);

	useEffect(() => {
		if (meetingState === 'error') {
			reportError(new Error('Daily reported a media connection error.'));
		}
	}, [meetingState, reportError]);

	// Initialize call when conversation is available
	useEffect(() => {
		void joinCall({ url: conversationUrl, audioSource })
			.then(onConnected)
			.catch(reportError);
		// Release the singleton call on unmount (see conversation-01): prevents
		// stale-room error cascades on the next conversation; StrictMode-safe.
		return () => {
			void leaveCall();
		};
	}, [audioSource, conversationUrl, joinCall, leaveCall, onConnected, reportError]);

	const handleLeave = useCallback(() => {
		void leaveCall().then(onLeave).catch(reportError);
	}, [leaveCall, onLeave, reportError]);

	return (
		<div className={styles.containerWrapper}>
			<div className={styles.container}>
				<div className={styles.videoContainer}>
					{hasMicError && (
						<div className={styles.errorContainer}>
							<p>Camera or microphone access denied. Please check your settings and try again.</p>
						</div>
					)}

					{/* Main video */}
					<div className={styles.mainVideoContainer}>
						<MainVideo onVideoReady={onVideoReady} />
					</div>

					{/* Self view */}
					<div className={styles.selfViewContainer}>
						<PreviewVideos />
					</div>
				</div>

				<div
					className={`${styles.footer} ${meetingState === 'left-meeting' ? styles.footerLeaving : ''}`}
					aria-hidden={meetingState === 'left-meeting'}
				>
					<div className={styles.footerControls}>
						<MicSelectBtn />
						<CameraSelectBtn />
						<ScreenShareButton />
						<button type="button" className={styles.leaveButton} onClick={handleLeave}>
							<span className={styles.leaveButtonIcon}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									role="img"
									aria-label="Leave Call"
								>
									<path
										d="M18 6L6 18M6 6L18 18"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
});
