export type MicrophoneCapture = {
  stream: MediaStream;
  deviceId: string;
  label: string;
  usedFallback: boolean;
};

const audioConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export async function openMicrophone(deviceId = ''): Promise<MicrophoneCapture> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture requires HTTPS or localhost and a supported browser.');
  }

  const devices = navigator.mediaDevices.enumerateDevices
    ? await navigator.mediaDevices.enumerateDevices().catch(() => [])
    : [];
  const inputs = devices.filter(device => device.kind === 'audioinput');
  const selected = inputs.find(device => device.deviceId === deviceId);
  const candidates = [
    ...(selected ? [selected] : []),
    ...inputs.filter(device => device.deviceId && device.deviceId !== 'default' && device.deviceId !== deviceId),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...audioConstraints,
          deviceId: { exact: candidate.deviceId },
        },
        video: false,
      });
      return {
        stream,
        deviceId: candidate.deviceId,
        label: candidate.label || 'Selected microphone',
        usedFallback: Boolean(deviceId && candidate.deviceId !== deviceId),
      };
    } catch (error) {
      lastError = error;
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    const active = stream.getAudioTracks()[0]?.getSettings().deviceId ?? '';
    const activeDevice = inputs.find(device => device.deviceId === active);
    return {
      stream,
      deviceId: active,
      label: activeDevice?.label || 'Default microphone',
      usedFallback: Boolean(deviceId && active !== deviceId),
    };
  } catch (error) {
    throw lastError ?? error;
  }
}
